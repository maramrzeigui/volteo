<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AdminSessionResource;
use App\Http\Resources\BorneResource;
use App\Http\Resources\Concerns;
use App\Http\Resources\ConnecteurResource;
use App\Models\Alerte;
use App\Models\AuditLog;
use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\DeploiementFirmware;
use App\Models\Maintenance;
use App\Models\Panne;
use App\Models\SessionRecharge;
use App\Models\Station;
use App\Models\User;
use App\Services\GestionSessions;
use App\Services\OcppClient;
use App\Support\Perimetre;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use Illuminate\Validation\ValidationException;

/** Module 2 (bornes) et module 3 (connecteurs) + commandes OCPP distantes (§6). */
class AdminBorneController extends Controller
{
    public function __construct(private readonly OcppClient $ocpp) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $bornes = Borne::with(['connecteurs', 'tarif', 'tarifSpecial', 'exploitant', 'technicien'])
            ->withCount(['alertes as alertes_ouvertes' => fn ($q) => $q->where('resolue', false)])
            ->where('source', 'reseau')
            ->when($request->query('etat'), fn ($q, $etat) => $q->where('etat', $etat))
            ->when($request->query('exploitant_id'), fn ($q, $id) => $q->where('exploitant_id', $id))
            ->when($request->query('q'), fn ($q, $t) => $q->where(fn ($w) => $w
                ->where('nom', 'like', "%{$t}%")->orWhere('reference', 'like', "%{$t}%")
                ->orWhere('adresse', 'like', "%{$t}%")->orWhere('numero_serie', 'like', "%{$t}%")))
            ->orderBy('nom')
            ->get();

        return BorneResource::collection($bornes);
    }

    /** Fiche borne : informations, statistiques 30 jours, session en cours. */
    public function show(Borne $borne): JsonResponse
    {
        $borne->load(['connecteurs', 'tarif', 'tarifSpecial', 'exploitant', 'technicien'])
            ->loadCount(['alertes as alertes_ouvertes' => fn ($q) => $q->where('resolue', false)]);

        $depuis = now()->subDays(30);
        $sessions = SessionRecharge::where('borne_id', $borne->id)->where('date_debut', '>=', $depuis);
        $terminees = (clone $sessions)->where('etat', 'terminee');
        $minutesCharge = (float) (clone $terminees)->selectRaw('SUM(TIMESTAMPDIFF(MINUTE, date_debut, date_fin)) as m')->value('m');
        $capacite = max(1, $borne->connecteurs->count()) * 30 * 24 * 60;

        return response()->json([
            'borne' => new BorneResource($borne),
            'stats' => [
                'sessions30j' => (clone $sessions)->count(),
                'kwh30j' => round((float) (clone $terminees)->sum('energie_kwh'), 2),
                'ca30j' => round((float) (clone $terminees)->sum('prix'), 2),
                'tauxOccupation' => round($minutesCharge / $capacite * 100, 1),
                'maintenances' => Maintenance::where('borne_id', $borne->id)->count(),
                'pannesOuvertes' => $borne->hasMany(Panne::class)->where('statut', '!=', 'resolue')->count(),
            ],
            'sessionsEnCours' => SessionRecharge::with(['user', 'connecteur', 'vehicule'])
                ->where('borne_id', $borne->id)
                ->whereIn('etat', SessionRecharge::ETATS_ACTIFS)
                ->get()
                ->map(fn ($s) => (new AdminSessionResource($s))->resolve()),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->valider($request, creation: true);
        $connecteurs = $data['connecteurs'];
        unset($data['connecteurs']);

        $perimetre = app(Perimetre::class);
        if ($perimetre->actif()) {
            // Une station ajoute ses bornes dans la limite de sa formule.
            $data['station_id'] = $perimetre->station();
        }
        if ($data['station_id'] ?? null) {
            $station = Station::findOrFail($data['station_id']);
            if ($station->bornes_max && Borne::withoutGlobalScope('perimetre')->where('station_id', $station->id)->count() >= $station->bornes_max) {
                throw ValidationException::withMessages(['stationId' => ["Votre formule est limitée à {$station->bornes_max} bornes. Contactez Volteo pour l’étendre."]]);
            }
        }

        $this->harmoniserResponsables($data, null);
        $borne = Borne::create([...$data, 'etat' => 'disponible', 'dernier_heartbeat' => null]);
        foreach ($connecteurs as $conn) {
            $borne->connecteurs()->create([
                'type' => $conn['type'],
                'puissance_kw' => $conn['puissanceKw'],
                'etat' => 'disponible',
            ]);
        }

        return (new BorneResource($borne->load('connecteurs')))->response()->setStatusCode(201);
    }

    public function update(Request $request, Borne $borne): BorneResource
    {
        $data = $this->valider($request, creation: false, borne: $borne);
        unset($data['connecteurs']);
        $this->harmoniserResponsables($data, $borne);

        $borne->update($data);

        return new BorneResource($borne->load(['connecteurs', 'tarif', 'exploitant', 'technicien']));
    }

    /** Désactivation (le cahier des charges ne prévoit pas de suppression physique). */
    public function destroy(Request $request, Borne $borne): JsonResponse
    {
        abort_if(
            $borne->sessions()->whereIn('etat', SessionRecharge::ETATS_ACTIFS)->exists(),
            409,
            'Une recharge est en cours sur cette borne.'
        );

        $borne->update(['etat' => 'hors_service']);
        $borne->connecteurs()->update(['etat' => 'indisponible']);
        AuditLog::record($request->user()->id, 'desactivation', 'borne:'.$borne->id, $borne->nom);

        return response()->json(['message' => 'Borne désactivée.']);
    }

    public function reactiver(Request $request, Borne $borne): JsonResponse
    {
        $borne->update(['etat' => $borne->estEnLigne() ? 'disponible' : 'deconnectee']);
        $borne->connecteurs()->where('etat', 'indisponible')->update(['etat' => 'disponible']);
        AuditLog::record($request->user()->id, 'reactivation', 'borne:'.$borne->id, $borne->nom);

        return response()->json(['message' => 'Borne réactivée.']);
    }

    /**
     * Génère un nouveau mot de passe OCPP (Security Profile 1). Il n'est affiché
     * qu'une fois : seul son hachage est conservé. La borne doit être reconfigurée
     * avec ce mot de passe (identifiant = référence de la borne).
     */
    public function motDePasseOcpp(Request $request, Borne $borne): JsonResponse
    {
        abort_if($borne->source === 'publique', 422, "Les bornes publiques d'autres opérateurs ne se connectent pas à notre serveur OCPP.");

        $motDePasse = Borne::genererMotDePasseOcpp();
        $borne->forceFill(['ocpp_mot_de_passe' => $motDePasse])->save();
        AuditLog::record($request->user()->id, 'mot_de_passe_ocpp_regenere', 'borne:'.$borne->id, $borne->reference);

        return response()->json([
            'identifiant' => $borne->reference,
            'motDePasse' => $motDePasse,
            'url' => rtrim((string) config('services.ocpp.url_publique'), '/').'/'.$borne->reference,
        ]);
    }

    /** Photo de la borne (JPEG, PNG ou WebP, 5 Mo max) ; remplace la précédente. */
    public function photo(Request $request, Borne $borne): BorneResource
    {
        $request->validate(['photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120', 'dimensions:min_width=400,min_height=250']]);

        $ancienne = $borne->photo;
        // Photo de l'exploitant : plus de crédit tiers à afficher.
        $borne->forceFill(['photo' => $request->file('photo')->store('bornes', 'public'), 'photo_credit' => null])->save();
        if ($ancienne) {
            Storage::disk('public')->delete($ancienne);
        }
        AuditLog::record($request->user()->id, 'photo_borne', 'borne:'.$borne->id, $borne->reference);

        return new BorneResource($borne);
    }

    public function supprimerPhoto(Request $request, Borne $borne): BorneResource
    {
        if ($borne->photo) {
            Storage::disk('public')->delete($borne->photo);
            $borne->forceFill(['photo' => null, 'photo_credit' => null])->save();
            AuditLog::record($request->user()->id, 'photo_borne_supprimee', 'borne:'.$borne->id, $borne->reference);
        }

        return new BorneResource($borne);
    }

    /** Historique consolidé de la borne : sessions, alertes, maintenances, firmware, actions. */
    public function historique(Borne $borne): JsonResponse
    {
        $evenements = collect();

        SessionRecharge::with('user')->where('borne_id', $borne->id)->latest('date_debut')->limit(50)->get()
            ->each(fn ($s) => $evenements->push([
                'date' => $s->date_debut->toIso8601String(),
                'categorie' => 'session',
                'titre' => "Recharge #{$s->id} — ".Concerns::nomComplet($s->user),
                'details' => sprintf('%s · %.2f kWh · %.2f', $s->etat, $s->energie_kwh, $s->prix),
            ]));

        Alerte::where('borne_id', $borne->id)->latest()->limit(50)->get()
            ->each(fn ($a) => $evenements->push([
                'date' => $a->created_at->toIso8601String(),
                'categorie' => 'alerte',
                'titre' => $a->message,
                'details' => $a->gravite.($a->resolue ? ' · résolue' : ' · ouverte'),
            ]));

        Maintenance::where('borne_id', $borne->id)->latest()->limit(50)->get()
            ->each(fn ($m) => $evenements->push([
                'date' => $m->created_at->toIso8601String(),
                'categorie' => 'maintenance',
                'titre' => "{$m->reference} — ".($m->titre ?? str($m->description)->limit(60)),
                'details' => "{$m->type} · {$m->statut}",
            ]));

        DeploiementFirmware::with('firmware')->where('borne_id', $borne->id)->latest()->limit(20)->get()
            ->each(fn ($d) => $evenements->push([
                'date' => $d->created_at->toIso8601String(),
                'categorie' => 'firmware',
                'titre' => ($d->rollback ? 'Rollback vers ' : 'Mise à jour vers ').$d->firmware?->version,
                'details' => $d->statut,
            ]));

        AuditLog::with('user')->where('cible', 'borne:'.$borne->id)->latest()->limit(50)->get()
            ->each(fn ($l) => $evenements->push([
                'date' => $l->created_at->toIso8601String(),
                'categorie' => 'action',
                'titre' => ucfirst(str_replace('_', ' ', $l->action)).' par '.(Concerns::nomComplet($l->user) ?? 'Système'),
                'details' => $l->details,
            ]));

        return response()->json($evenements->sortByDesc('date')->values()->take(150));
    }

    /** Commandes OCPP distantes (§6). */
    public function commande(Request $request, Borne $borne, GestionSessions $sessions): JsonResponse
    {
        $data = $request->validate([
            'commande' => ['required', 'in:reset,reset_hard,unlock,change_configuration,get_configuration,get_diagnostics,remote_stop'],
            'connecteurId' => ['nullable', 'integer'],
            'cle' => ['required_if:commande,change_configuration', 'string', 'max:100'],
            'valeur' => ['required_if:commande,change_configuration', 'string', 'max:500'],
        ]);

        $connecteur = isset($data['connecteurId'])
            ? $borne->connecteurs()->findOrFail($data['connecteurId'])
            : $borne->connecteurs()->orderBy('id')->first();

        $resultat = match ($data['commande']) {
            'reset' => $this->ocpp->reset($borne, 'Soft'),
            'reset_hard' => $this->ocpp->reset($borne, 'Hard'),
            'unlock' => $connecteur ? $this->ocpp->unlock($borne, $connecteur) : ['ok' => false, 'message' => 'Aucun connecteur.'],
            'change_configuration' => $this->ocpp->changeConfiguration($borne, $data['cle'], $data['valeur']),
            'get_configuration' => $this->ocpp->getConfiguration($borne),
            'get_diagnostics' => $this->ocpp->getDiagnostics(
                $borne,
                URL::temporarySignedRoute('ocpp.diagnostics.upload', now()->addHour(), ['borne' => $borne->id])
            ),
            'remote_stop' => $this->arreterSessionsBorne($borne, $sessions),
        };

        AuditLog::record(
            $request->user()->id,
            'commande_ocpp',
            'borne:'.$borne->id,
            $data['commande'].(isset($data['cle']) ? " {$data['cle']}={$data['valeur']}" : '')
        );

        return response()->json(
            ['message' => $resultat['message'], 'donnees' => $resultat['donnees'] ?? null],
            $resultat['ok'] ? 200 : 502
        );
    }

    // --- Module 3 : connecteurs ---

    public function storeConnecteur(Request $request, Borne $borne): ConnecteurResource
    {
        $data = $this->validerConnecteur($request);

        return new ConnecteurResource($borne->connecteurs()->create([...$data, 'etat' => $data['etat'] ?? 'disponible']));
    }

    public function updateConnecteur(Request $request, Connecteur $connecteur): ConnecteurResource
    {
        $connecteur->update($this->validerConnecteur($request, partiel: true));

        return new ConnecteurResource($connecteur);
    }

    public function destroyConnecteur(Connecteur $connecteur): JsonResponse
    {
        abort_if($connecteur->etat === 'occupe', 409, 'Ce connecteur est en cours d\'utilisation.');

        // Un connecteur ayant un historique est mis hors service plutôt que supprimé.
        if (SessionRecharge::where('connecteur_id', $connecteur->id)->exists()) {
            $connecteur->update(['etat' => 'indisponible']);

            return response()->json(['message' => 'Connecteur mis hors service (historique conservé).']);
        }

        $connecteur->delete();

        return response()->json(['message' => 'Connecteur supprimé.']);
    }

    private function arreterSessionsBorne(Borne $borne, GestionSessions $sessions): array
    {
        $actives = $borne->sessions()->whereIn('etat', SessionRecharge::ETATS_ACTIFS)->get();
        if ($actives->isEmpty()) {
            return ['ok' => false, 'message' => 'Aucune recharge en cours sur cette borne.'];
        }
        $actives->each(fn ($s) => $sessions->terminer($s));

        return ['ok' => true, 'message' => $actives->count().' recharge(s) arrêtée(s).'];
    }

    private function validerConnecteur(Request $request, bool $partiel = false): array
    {
        $regle = $partiel ? 'sometimes' : 'required';
        $data = $request->validate([
            'type' => [$regle, Rule::in(Connecteur::TYPES)],
            'puissanceKw' => [$regle, 'integer', 'min:1', 'max:400'],
            'etat' => ['sometimes', Rule::in(Connecteur::ETATS)],
        ]);

        if (isset($data['puissanceKw'])) {
            $data['puissance_kw'] = $data['puissanceKw'];
            unset($data['puissanceKw']);
        }

        return $data;
    }

    private function valider(Request $request, bool $creation, ?Borne $borne = null): array
    {
        $unique = $creation ? '' : ','.$borne->id;
        $requis = $creation ? 'required' : 'sometimes';

        $data = $request->validate([
            'nom' => [$requis, 'string', 'max:150'],
            'reference' => [$requis, 'string', 'max:50', 'unique:bornes,reference'.$unique],
            'numeroSerie' => [$requis, 'string', 'max:100', 'unique:bornes,numero_serie'.$unique],
            'modele' => [$requis, 'string', 'max:100'],
            'fabricant' => [$requis, 'string', 'max:100'],
            'adresse' => [$requis, 'string', 'max:255'],
            'site' => ['nullable', 'string', 'max:100'],
            'latitude' => [$requis, 'numeric', 'between:-90,90'],
            'longitude' => [$requis, 'numeric', 'between:-180,180'],
            'versionFirmware' => [$requis, 'string', 'max:50'],
            'versionOcpp' => [$requis, 'in:1.6,2.0.1'],
            'puissanceKw' => [$requis, 'integer', 'min:1'],
            'tarifKwh' => [$requis, 'numeric', 'min:0'],
            'tarifId' => ['nullable', $this->tarifAutorise()],
            'tarifSpecialId' => ['nullable', $this->tarifAutorise()],
            // Rattachement d'une borne à une station : réservé à la plateforme.
            'stationId' => ['nullable', 'exists:stations,id'],
            'exploitantId' => ['nullable', Rule::exists('users', 'id')->where('role', 'exploitant')],
            'technicienId' => ['nullable', Rule::exists('users', 'id')->where('role', 'technicien')],
            'etat' => ['sometimes', Rule::in(Borne::ETATS)],
            'connecteurs' => [$requis, 'array', 'min:1'],
            'connecteurs.*.type' => ['required_with:connecteurs', Rule::in(Connecteur::TYPES)],
            'connecteurs.*.puissanceKw' => ['required_with:connecteurs', 'integer', 'min:1'],
        ]);

        // camelCase (API) → snake_case (colonnes)
        $mapping = [
            'numeroSerie' => 'numero_serie',
            'versionFirmware' => 'version_firmware',
            'versionOcpp' => 'version_ocpp',
            'puissanceKw' => 'puissance_kw',
            'tarifKwh' => 'tarif_kwh',
            'tarifId' => 'tarif_id',
            'tarifSpecialId' => 'tarif_special_id',
            'exploitantId' => 'exploitant_id',
            'technicienId' => 'technicien_id',
            'stationId' => 'station_id',
        ];
        foreach ($mapping as $camel => $snake) {
            if (array_key_exists($camel, $data)) {
                $data[$snake] = $data[$camel];
                unset($data[$camel]);
            }
        }

        if (app(Perimetre::class)->actif()) {
            unset($data['station_id']);
        }
        $data['connecteurs'] ??= [];

        return $data;
    }

    /**
     * Responsables d'une borne : l'admin (exploitant) et le technicien appartiennent à la station
     * de la borne. Sans admin choisi, celui de la station est attribué automatiquement.
     */
    private function harmoniserResponsables(array &$data, ?Borne $borne): void
    {
        $stationId = array_key_exists('station_id', $data) ? $data['station_id'] : ($borne?->station_id ?? app(Perimetre::class)->station());
        if (! $stationId) {
            return;
        }
        foreach (['exploitant_id' => 'exploitantId', 'technicien_id' => 'technicienId'] as $colonne => $champ) {
            $id = array_key_exists($colonne, $data) ? $data[$colonne] : $borne?->{$colonne};
            if ($id && User::whereKey($id)->value('station_id') !== $stationId) {
                if (array_key_exists($colonne, $data)) {
                    throw ValidationException::withMessages([$champ => ['Cette personne ne fait pas partie de la station de la borne.']]);
                }
                // Changement de station : l'ancien responsable n'est plus le bon.
                $data[$colonne] = null;
            }
        }
        $admin = array_key_exists('exploitant_id', $data) ? $data['exploitant_id'] : $borne?->exploitant_id;
        if (! $admin) {
            $data['exploitant_id'] = User::where('station_id', $stationId)->where('role', 'exploitant')->where('actif', true)->orderBy('id')->value('id');
        }
    }

    /** Tarif utilisable : ceux de la station (et ceux de la plateforme) pour le personnel d'une station. */
    private function tarifAutorise(): Exists
    {
        $station = app(Perimetre::class)->station();

        return Rule::exists('tarifs', 'id')->where(fn ($q) => $station ? $q->where(fn ($w) => $w->where('station_id', $station)->orWhereNull('station_id')) : $q);
    }
}
