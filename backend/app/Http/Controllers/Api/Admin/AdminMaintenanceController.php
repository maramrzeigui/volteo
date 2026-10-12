<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\DocumentResource;
use App\Http\Resources\MaintenanceResource;
use App\Http\Resources\PanneResource;
use App\Models\Alerte;
use App\Models\Document;
use App\Models\Maintenance;
use App\Models\MaintenanceIntervention;
use App\Models\MaintenancePiece;
use App\Models\Panne;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * Module 11 — planification, ordres de travail, pannes, pièces remplacées,
 * interventions, commentaires et photos.
 */
class AdminMaintenanceController extends Controller
{
    private const RELATIONS_DETAIL = ['borne', 'technicien', 'pieces', 'interventions.technicien', 'commentaires.user', 'photos.auteur'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();

        $ordres = Maintenance::with(['borne', 'technicien', 'pieces'])
            ->when($request->query('statut'), fn ($q, $s) => $q->whereIn('statut', explode(',', $s)))
            ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
            ->when($request->query('borne_id'), fn ($q, $id) => $q->where('borne_id', $id))
            ->when($request->query('technicien_id'), fn ($q, $id) => $q->where('technicien_id', $id))
            // Un technicien voit par défaut ses ordres de travail et ceux non affectés.
            ->when($user->role === 'technicien' && ! $request->boolean('tous'), fn ($q) => $q->where(fn ($w) => $w
                ->where('technicien_id', $user->id)->orWhereNull('technicien_id')))
            ->when($request->query('debut'), fn ($q, $d) => $q->whereDate('date_prevue', '>=', $d))
            ->when($request->query('fin'), fn ($q, $d) => $q->whereDate('date_prevue', '<=', $d))
            ->orderByRaw("FIELD(statut, 'en_cours', 'planifiee', 'terminee', 'annulee')")
            ->orderBy('date_prevue')
            ->get();

        return MaintenanceResource::collection($ordres);
    }

    public function show(Maintenance $maintenance): MaintenanceResource
    {
        return new MaintenanceResource($maintenance->load(self::RELATIONS_DETAIL));
    }

    public function store(Request $request): MaintenanceResource
    {
        $data = $this->valider($request);
        $maintenance = Maintenance::create($data);

        if ($maintenance->type === 'corrective' || $maintenance->datePrevueAujourdhui()) {
            $maintenance->borne->update(['etat' => 'maintenance']);
        }
        if ($maintenance->panne_id) {
            Panne::whereKey($maintenance->panne_id)->where('statut', 'ouverte')->update(['statut' => 'en_cours']);
        }

        return new MaintenanceResource($maintenance->load(self::RELATIONS_DETAIL));
    }

    public function update(Request $request, Maintenance $maintenance): MaintenanceResource
    {
        $data = $this->valider($request, partiel: true);
        $ancienStatut = $maintenance->statut;
        $maintenance->fill($data);

        if ($maintenance->isDirty('statut')) {
            if ($maintenance->statut === 'en_cours') {
                $maintenance->date_debut ??= now();
                $maintenance->borne->update(['etat' => 'maintenance']);
            }
            if (in_array($maintenance->statut, ['terminee', 'annulee'], true)) {
                $maintenance->date_fin ??= now();
            }
        }
        $maintenance->save();

        if ($ancienStatut !== $maintenance->statut && in_array($maintenance->statut, ['terminee', 'annulee'], true)) {
            $this->cloturer($maintenance);
        }

        return new MaintenanceResource($maintenance->load(self::RELATIONS_DETAIL));
    }

    public function destroy(Maintenance $maintenance): JsonResponse
    {
        abort_if($maintenance->statut === 'en_cours', 409, 'Un ordre de travail en cours ne peut pas être supprimé.');
        $maintenance->delete();

        return response()->json(['message' => 'Ordre de travail supprimé.']);
    }

    // --- Pièces remplacées ---

    public function storePiece(Request $request, Maintenance $maintenance): MaintenanceResource
    {
        $data = $request->validate([
            'designation' => ['required', 'string', 'max:150'],
            'reference' => ['nullable', 'string', 'max:100'],
            'quantite' => ['required', 'integer', 'min:1'],
            'coutUnitaire' => ['required', 'numeric', 'min:0'],
        ]);
        $maintenance->pieces()->create([
            'designation' => $data['designation'],
            'reference' => $data['reference'] ?? null,
            'quantite' => $data['quantite'],
            'cout_unitaire' => $data['coutUnitaire'],
        ]);

        return new MaintenanceResource($maintenance->load(self::RELATIONS_DETAIL));
    }

    public function destroyPiece(MaintenancePiece $piece): JsonResponse
    {
        $piece->delete();

        return response()->json(['message' => 'Pièce retirée.']);
    }

    // --- Interventions ---

    public function storeIntervention(Request $request, Maintenance $maintenance): MaintenanceResource
    {
        $data = $request->validate([
            'technicienId' => ['nullable', 'exists:users,id'],
            'debut' => ['required', 'date'],
            'fin' => ['nullable', 'date', 'after_or_equal:debut'],
            'description' => ['required', 'string', 'max:2000'],
        ]);
        $maintenance->interventions()->create([
            'technicien_id' => $data['technicienId'] ?? $request->user()->id,
            'debut' => $data['debut'],
            'fin' => $data['fin'] ?? null,
            'description' => $data['description'],
        ]);
        if ($maintenance->statut === 'planifiee') {
            $maintenance->update(['statut' => 'en_cours', 'date_debut' => $maintenance->date_debut ?? $data['debut']]);
        }

        return new MaintenanceResource($maintenance->load(self::RELATIONS_DETAIL));
    }

    public function destroyIntervention(MaintenanceIntervention $intervention): JsonResponse
    {
        $intervention->delete();

        return response()->json(['message' => 'Intervention supprimée.']);
    }

    // --- Commentaires & photos ---

    public function storeCommentaire(Request $request, Maintenance $maintenance): MaintenanceResource
    {
        $data = $request->validate(['contenu' => ['required', 'string', 'max:2000']]);
        $maintenance->commentaires()->create(['user_id' => $request->user()->id, 'contenu' => $data['contenu']]);

        return new MaintenanceResource($maintenance->load(self::RELATIONS_DETAIL));
    }

    public function storePhoto(Request $request, Maintenance $maintenance): DocumentResource
    {
        $data = $request->validate([
            'fichier' => ['required', 'image', 'max:10240'],
            'legende' => ['nullable', 'string', 'max:150'],
        ]);
        $fichier = $data['fichier'];

        return new DocumentResource(Document::create([
            'borne_id' => $maintenance->borne_id,
            'maintenance_id' => $maintenance->id,
            'type' => 'photo',
            'titre' => $data['legende'] ?? "Photo {$maintenance->reference}",
            'fichier' => $fichier->store("documents/{$maintenance->borne_id}"),
            'nom_fichier' => $fichier->getClientOriginalName(),
            'mime' => $fichier->getMimeType(),
            'taille' => $fichier->getSize(),
            'televerse_par' => $request->user()->id,
        ]));
    }

    // --- Pannes ---

    public function pannes(Request $request): AnonymousResourceCollection
    {
        return PanneResource::collection(
            Panne::with(['borne', 'signaleur', 'maintenances'])
                ->when($request->query('statut'), fn ($q, $s) => $q->whereIn('statut', explode(',', $s)))
                ->when($request->query('borne_id'), fn ($q, $id) => $q->where('borne_id', $id))
                ->orderByRaw("FIELD(statut, 'ouverte', 'en_cours', 'resolue')")
                ->latest()
                ->get()
        );
    }

    public function storePanne(Request $request): PanneResource
    {
        $data = $request->validate([
            'borneId' => ['required', 'exists:bornes,id'],
            'connecteurId' => ['nullable', 'exists:connecteurs,id'],
            'alerteId' => ['nullable', 'exists:alertes,id'],
            'type' => ['required', Rule::in(['electrique', 'mecanique', 'logicielle', 'communication', 'connecteur', 'ecran', 'autre'])],
            'gravite' => ['required', Rule::in(['faible', 'moyenne', 'elevee', 'critique'])],
            'description' => ['required', 'string', 'max:2000'],
        ]);

        $panne = Panne::create([
            'borne_id' => $data['borneId'],
            'connecteur_id' => $data['connecteurId'] ?? null,
            'alerte_id' => $data['alerteId'] ?? null,
            'signale_par' => $request->user()->id,
            'type' => $data['type'],
            'gravite' => $data['gravite'],
            'description' => $data['description'],
        ]);

        if (in_array($panne->gravite, ['elevee', 'critique'], true)) {
            $panne->borne->update(['etat' => 'defaut']);
        }
        if ($panne->alerte_id) {
            Alerte::whereKey($panne->alerte_id)->update(['prise_en_charge_par' => $request->user()->id]);
        }

        return new PanneResource($panne->load(['borne', 'signaleur', 'maintenances']));
    }

    public function updatePanne(Request $request, Panne $panne): PanneResource
    {
        $data = $request->validate([
            'statut' => ['sometimes', Rule::in(['ouverte', 'en_cours', 'resolue'])],
            'gravite' => ['sometimes', Rule::in(['faible', 'moyenne', 'elevee', 'critique'])],
            'description' => ['sometimes', 'string', 'max:2000'],
        ]);
        $panne->fill($data);
        if ($panne->isDirty('statut') && $panne->statut === 'resolue') {
            $panne->resolue_le = now();
            if ($panne->alerte_id) {
                Alerte::whereKey($panne->alerte_id)->update(['resolue' => true, 'resolue_le' => now(), 'resolue_par' => $request->user()->id]);
            }
        }
        $panne->save();

        return new PanneResource($panne->load(['borne', 'signaleur', 'maintenances']));
    }

    /** Clôture : remise en service de la borne, résolution des pannes, prochaine préventive. */
    private function cloturer(Maintenance $maintenance): void
    {
        $borne = $maintenance->borne;
        $autresOuvertes = Maintenance::where('borne_id', $borne->id)
            ->where('id', '!=', $maintenance->id)
            ->where('statut', 'en_cours')
            ->exists();

        if ($maintenance->statut === 'terminee' && $maintenance->panne_id) {
            $maintenance->panne?->update(['statut' => 'resolue', 'resolue_le' => now()]);
        }

        if (! $autresOuvertes && in_array($borne->etat, ['maintenance', 'defaut'], true)) {
            $borne->update(['etat' => $borne->estEnLigne() ? 'disponible' : 'deconnectee']);
            $borne->connecteurs()->whereIn('etat', ['indisponible', 'defaut'])->update(['etat' => 'disponible']);
        }

        if ($maintenance->statut === 'terminee' && $maintenance->type === 'preventive' && $maintenance->periodicite_jours) {
            Maintenance::create([
                'borne_id' => $maintenance->borne_id,
                'technicien_id' => $maintenance->technicien_id,
                'type' => 'preventive',
                'priorite' => $maintenance->priorite,
                'titre' => $maintenance->titre,
                'description' => $maintenance->description,
                'date_prevue' => now()->addDays($maintenance->periodicite_jours)->toDateString(),
                'periodicite_jours' => $maintenance->periodicite_jours,
            ]);
        }
    }

    private function valider(Request $request, bool $partiel = false): array
    {
        $r = $partiel ? 'sometimes' : 'required';
        $data = $request->validate([
            'borneId' => [$r, 'exists:bornes,id'],
            'panneId' => ['nullable', 'exists:pannes,id'],
            'technicienId' => ['nullable', Rule::exists('users', 'id')->where('role', 'technicien')],
            'type' => [$r, Rule::in(['preventive', 'corrective'])],
            'priorite' => ['sometimes', Rule::in(['basse', 'normale', 'haute', 'urgente'])],
            'titre' => ['nullable', 'string', 'max:150'],
            'description' => [$r, 'string', 'max:5000'],
            'datePrevue' => ['nullable', 'date'],
            'statut' => ['sometimes', Rule::in(['planifiee', 'en_cours', 'terminee', 'annulee'])],
            'rapport' => ['nullable', 'string', 'max:5000'],
            'periodiciteJours' => ['nullable', 'integer', 'min:1', 'max:730'],
        ]);

        $mapping = [
            'borneId' => 'borne_id', 'panneId' => 'panne_id', 'technicienId' => 'technicien_id',
            'datePrevue' => 'date_prevue', 'periodiciteJours' => 'periodicite_jours',
        ];
        foreach ($mapping as $camel => $snake) {
            if (array_key_exists($camel, $data)) {
                $data[$snake] = $data[$camel];
                unset($data[$camel]);
            }
        }

        return $data;
    }
}
