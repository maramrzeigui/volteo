<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\DeploiementResource;
use App\Http\Resources\FirmwareResource;
use App\Models\AuditLog;
use App\Models\Borne;
use App\Models\DeploiementFirmware;
use App\Models\Firmware;
use App\Services\OcppClient;
use App\Support\Perimetre;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Module 13 — téléversement, déploiement (OCPP UpdateFirmware), historique, versions et rollback. */
class AdminFirmwareController extends Controller
{
    public function __construct(private readonly OcppClient $ocpp) {}

    public function index(): AnonymousResourceCollection
    {
        return FirmwareResource::collection(Firmware::with('auteur')->withCount('deploiements')->latest()->get());
    }

    public function store(Request $request): FirmwareResource
    {
        abort_if(app(Perimetre::class)->actif(), 403, 'Réservé à la plateforme Volteo.');
        $data = $request->validate([
            'fichier' => ['required', 'file', 'max:204800'],
            'version' => ['required', 'string', 'max:50'],
            'fabricant' => ['nullable', 'string', 'max:100'],
            'modele' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $fichier = $data['fichier'];
        $chemin = $fichier->store('firmwares');

        return new FirmwareResource(Firmware::create([
            'version' => $data['version'],
            'fabricant' => $data['fabricant'] ?? null,
            'modele' => $data['modele'] ?? null,
            'fichier' => $chemin,
            'nom_fichier' => $fichier->getClientOriginalName(),
            'taille' => $fichier->getSize(),
            'checksum_sha256' => hash_file('sha256', Storage::path($chemin)),
            'notes' => $data['notes'] ?? null,
            'televerse_par' => $request->user()->id,
        ])->load('auteur'));
    }

    public function destroy(Firmware $firmware): JsonResponse
    {
        abort_if(app(Perimetre::class)->actif(), 403, 'Réservé à la plateforme Volteo.');
        abort_if(
            $firmware->deploiements()->whereIn('statut', DeploiementFirmware::STATUTS_EN_COURS)->exists(),
            409,
            'Un déploiement de ce firmware est en cours.'
        );
        Storage::delete($firmware->fichier);
        $firmware->delete();

        return response()->json(['message' => 'Firmware supprimé.']);
    }

    /** Déploie un firmware sur une ou plusieurs bornes. */
    public function deployer(Request $request, Firmware $firmware): JsonResponse
    {
        $data = $request->validate([
            'borneIds' => ['required', 'array', 'min:1'],
            'borneIds.*' => ['integer', 'exists:bornes,id'],
        ]);

        $resultats = Borne::whereIn('id', $data['borneIds'])->get()
            ->map(fn (Borne $b) => $this->lancer($firmware, $b, $request->user()->id));

        AuditLog::record($request->user()->id, 'deploiement_firmware', 'firmware:'.$firmware->id, "v{$firmware->version} → ".count($data['borneIds']).' borne(s)');

        return response()->json([
            'message' => $resultats->where('ok', true)->count().'/'.$resultats->count().' borne(s) ont accepté la mise à jour.',
            'resultats' => $resultats,
        ]);
    }

    public function deploiements(Request $request): AnonymousResourceCollection
    {
        return DeploiementResource::collection(
            DeploiementFirmware::with(['firmware', 'borne', 'lanceur'])
                ->when($request->query('borne_id'), fn ($q, $id) => $q->where('borne_id', $id))
                ->when($request->query('firmware_id'), fn ($q, $id) => $q->where('firmware_id', $id))
                ->latest()
                ->limit(300)
                ->get()
        );
    }

    /** Rollback : redéploie la version installée avant ce déploiement. */
    public function rollback(Request $request, DeploiementFirmware $deploiement): JsonResponse
    {
        $deploiement->load(['firmware', 'borne']);
        abort_unless($deploiement->version_precedente, 422, 'Version précédente inconnue.');

        $precedent = Firmware::where('version', $deploiement->version_precedente)
            ->when($deploiement->firmware->fabricant, fn ($q, $f) => $q->where(fn ($w) => $w->where('fabricant', $f)->orWhereNull('fabricant')))
            ->latest()
            ->first();
        abort_unless($precedent, 422, "Le firmware {$deploiement->version_precedente} n'est plus disponible : téléversez-le pour revenir en arrière.");

        $resultat = $this->lancer($precedent, $deploiement->borne, $request->user()->id, rollback: true);
        AuditLog::record($request->user()->id, 'rollback_firmware', 'borne:'.$deploiement->borne_id, "→ v{$precedent->version}");

        return response()->json(['message' => $resultat['message']], $resultat['ok'] ? 200 : 502);
    }

    /** Téléchargement du binaire par la borne (URL signée transmise dans UpdateFirmware). */
    public function telecharger(Firmware $firmware): StreamedResponse
    {
        return Storage::download($firmware->fichier, $firmware->nom_fichier);
    }

    private function lancer(Firmware $firmware, Borne $borne, int $userId, bool $rollback = false): array
    {
        if (DeploiementFirmware::where('borne_id', $borne->id)->whereIn('statut', DeploiementFirmware::STATUTS_EN_COURS)->exists()) {
            return ['borneId' => $borne->id, 'ok' => false, 'message' => "{$borne->nom} : une mise à jour est déjà en cours."];
        }

        $deploiement = DeploiementFirmware::create([
            'firmware_id' => $firmware->id,
            'borne_id' => $borne->id,
            'version_precedente' => $borne->version_firmware,
            'rollback' => $rollback,
            'lance_par' => $userId,
        ]);

        $url = URL::temporarySignedRoute('firmware.telecharger', now()->addDay(), ['firmware' => $firmware->id, 'version' => $firmware->version]);
        $reponse = $this->ocpp->updateFirmware($borne, $url);

        $deploiement->update([
            'statut' => $reponse['ok'] ? 'en_attente' : 'echec',
            'message' => $reponse['message'],
        ]);

        return ['borneId' => $borne->id, 'ok' => $reponse['ok'], 'message' => "{$borne->nom} : {$reponse['message']}"];
    }
}
