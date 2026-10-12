<?php

namespace App\Http\Controllers\Api\Internal;

use App\Http\Controllers\Controller;
use App\Models\Alerte;
use App\Models\BadgeRfid;
use App\Models\Borne;
use App\Models\DeploiementFirmware;
use App\Models\Document;
use App\Models\MesureRecharge;
use App\Models\Parametre;
use App\Models\SessionRecharge;
use App\Services\GestionSessions;
use App\Services\OcppClient;
use App\Services\Tarification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Réception des événements OCPP relayés par le serveur OCPP (ocpp-server/).
 * Routes protégées par le secret partagé (middleware ocpp.secret).
 *
 * L'état d'une borne est calculé, jamais déclaré :
 * - « occupée / disponible / défaut » découle des StatusNotification de ses prises ;
 * - « déconnectée » découle de la perte du WebSocket (événement /deconnexion)
 *   ou de l'absence de heartbeat (tâche bornes:verifier-heartbeats) ;
 * - tout message reçu d'une borne la remet en ligne et recalcule son état.
 */
class OcppEventController extends Controller
{
    /** Statuts OCPP 1.6 d'un connecteur → état métier du connecteur. */
    private const STATUTS_CONNECTEUR = [
        'Available' => 'disponible',
        'Preparing' => 'occupe',
        'Charging' => 'occupe',
        'SuspendedEV' => 'occupe',
        'SuspendedEVSE' => 'occupe',
        'Finishing' => 'occupe',
        'Reserved' => 'reserve',
        'Unavailable' => 'indisponible',
        'Faulted' => 'defaut',
    ];

    /** Statut OCPP du connecteur 0 (borne entière) → état de la borne. */
    private const STATUTS_BORNE = [
        'Unavailable' => 'indisponible',
        'Faulted' => 'defaut',
    ];

    /** ChargePointErrorCode OCPP 1.6 → type d'alerte (module 12). */
    private const ERREURS = [
        'HighTemperature' => ['surchauffe', 'critique'],
        'PowerSwitchFailure' => ['coupure_electrique', 'critique'],
        'UnderVoltage' => ['coupure_electrique', 'critique'],
        'OverVoltage' => ['coupure_electrique', 'critique'],
        'OverCurrentFailure' => ['defaut_materiel', 'critique'],
        'GroundFailure' => ['defaut_materiel', 'critique'],
        'ConnectorLockFailure' => ['defaut_materiel', 'warning'],
        'EVCommunicationError' => ['defaut_materiel', 'warning'],
        'PowerMeterFailure' => ['defaut_materiel', 'warning'],
        'ReaderFailure' => ['defaut_materiel', 'warning'],
        'InternalError' => ['erreur_ocpp', 'warning'],
        'LocalListConflict' => ['erreur_ocpp', 'info'],
        'WeakSignal' => ['erreur_ocpp', 'info'],
    ];

    /** Tolérance sur la puissance mesurée au-delà de la puissance nominale de la prise. */
    private const TOLERANCE_PUISSANCE = 1.05;

    public function __construct(
        private readonly GestionSessions $sessions,
        private readonly Tarification $tarification,
    ) {}

    /**
     * Ouverture du WebSocket : authentification de la borne (OCPP 1.6 Security
     * Profile 1, HTTP Basic). Appelé par le serveur OCPP avant d'accepter la connexion.
     */
    public function connexion(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reference' => ['required', 'string', 'max:64'],
            'motDePasse' => ['nullable', 'string', 'max:128'],
        ]);

        $borne = Borne::where('reference', $data['reference'])->first();

        $refus = match (true) {
            ! $borne => 'Borne inconnue',
            $borne->source === 'publique' => "Borne publique d'un autre opérateur",
            $borne->ocpp_mot_de_passe !== null => $borne->verifierMotDePasseOcpp($data['motDePasse'] ?? null) ? null : 'Mot de passe OCPP invalide',
            (bool) config('services.ocpp.exiger_mot_de_passe') => 'Aucun mot de passe OCPP configuré pour cette borne',
            default => null,
        };

        if ($refus) {
            if ($borne && $borne->source !== 'publique') {
                Alerte::lever($borne, 'erreur_ocpp', 'warning', "Connexion OCPP refusée pour {$borne->nom} : {$refus}");
            }

            return response()->json(['accepte' => false, 'message' => $refus], 401);
        }

        return response()->json(['accepte' => true]);
    }

    /** Fermeture du WebSocket (borne éteinte, réseau coupé, ping sans réponse). */
    public function deconnexion(Request $request): JsonResponse
    {
        $data = $request->validate(['reference' => ['required', 'string']]);

        $borne = Borne::where('reference', $data['reference'])->firstOrFail();
        $borne->deconnectee_le = now();
        if (! in_array($borne->etat, Borne::ETATS_MANUELS, true)) {
            $borne->etat = 'deconnectee';
        }
        $borne->save();

        return response()->json(['message' => 'OK']);
    }

    /** BootNotification : la borne se (re)connecte. */
    public function boot(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reference' => ['required', 'string'],
            'versionFirmware' => ['nullable', 'string'],
            'modele' => ['nullable', 'string'],
            'fabricant' => ['nullable', 'string'],
            'numeroSerie' => ['nullable', 'string'],
        ]);

        $borne = Borne::where('reference', $data['reference'])->first();
        if (! $borne) {
            return response()->json(['message' => 'Borne inconnue', 'status' => 'Rejected'], 404);
        }

        if ($data['versionFirmware'] ?? null) {
            $borne->version_firmware = $data['versionFirmware'];
        }
        $this->remettreEnLigne($borne);

        return response()->json([
            'message' => 'Accepted',
            'status' => 'Accepted',
            'interval' => (int) config('services.ocpp.intervalle_heartbeat', 30),
        ]);
    }

    /** Heartbeat périodique. */
    public function heartbeat(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reference' => ['required', 'string'],
            'temperatureC' => ['nullable', 'numeric'],
        ]);

        $borne = Borne::where('reference', $data['reference'])->firstOrFail();

        if (isset($data['temperatureC'])) {
            $borne->temperature_c = $data['temperatureC'];

            // Alerte automatique de surchauffe (module 12), seuil paramétrable.
            if ($data['temperatureC'] >= (float) Parametre::get('seuil_temperature', 60)) {
                Alerte::lever($borne, 'surchauffe', 'critique', "Température de {$data['temperatureC']} °C sur {$borne->nom}");
            }
        }

        $this->remettreEnLigne($borne);

        return response()->json(['message' => 'OK']);
    }

    /**
     * StatusNotification : état d'un connecteur (connectorId ≥ 1) ou de la
     * borne entière (connectorId 0), avec code d'erreur éventuel.
     */
    public function status(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reference' => ['required', 'string'],
            'etat' => ['nullable', 'in:disponible,occupee,hors_service,maintenance,deconnectee,defaut'],
            'connectorId' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', 'string'],
            'errorCode' => ['nullable', 'string'],
            'vendorErrorCode' => ['nullable', 'string'],
            'info' => ['nullable', 'string'],
        ]);

        $borne = Borne::where('reference', $data['reference'])->firstOrFail();

        $this->leverAlerteErreur($borne, $data);

        $numero = (int) ($data['connectorId'] ?? 0);
        $connecteur = $numero > 0 ? OcppClient::connecteurParNumero($borne, $numero) : null;
        $etatConnecteur = self::STATUTS_CONNECTEUR[$data['status'] ?? ''] ?? null;

        if ($connecteur && $etatConnecteur) {
            $connecteur->update(['etat' => $etatConnecteur]);
        }

        $borne->dernier_heartbeat = now();
        $borne->deconnectee_le = null;

        if (in_array($borne->etat, Borne::ETATS_MANUELS, true)) {
            // Hors service / maintenance décidés par l'exploitant : inchangés.
        } elseif ($numero === 0 && isset(self::STATUTS_BORNE[$data['status'] ?? ''])) {
            $borne->etat = self::STATUTS_BORNE[$data['status']];
        } elseif (isset($data['etat']) && ! isset($data['status'])) {
            // Compatibilité : état global transmis directement.
            $borne->etat = $data['etat'];
        } else {
            $borne->etat = $borne->etatCalcule();
        }

        $borne->save();

        if ($borne->etat === 'defaut') {
            Alerte::lever($borne, 'defaut_materiel', 'critique', "Défaut matériel signalé par {$borne->nom}"
                .(isset($data['errorCode']) && $data['errorCode'] !== 'NoError' ? " ({$data['errorCode']})" : ''));
        }

        return response()->json(['message' => 'OK']);
    }

    /** Authorize : contrôle d'un badge RFID présenté à la borne (module 7). */
    public function autoriser(Request $request): JsonResponse
    {
        $data = $request->validate(['reference' => ['required', 'string'], 'idTag' => ['required', 'string']]);

        $borne = Borne::where('reference', $data['reference'])->first();
        $badge = BadgeRfid::with('user')->where('uid', $data['idTag'])->first();
        $statut = $badge?->statutOcpp() ?? 'Invalid';
        // Badge valide mais wallet insuffisant ou recharge impayée : la borne refuse le badge.
        $motif = $statut === 'Accepted' ? $badge->user?->motifRefusRecharge() : null;
        if ($motif) {
            $statut = 'Blocked';
        }

        if ($badge) {
            $badge->journaliser($statut === 'Accepted' ? 'autorisation_acceptee' : 'autorisation_refusee', $motif ?? $statut, $borne?->id);
            if ($statut === 'Accepted') {
                $badge->update(['derniere_utilisation' => now()]);
            }
        }

        return response()->json(['status' => $statut]);
    }

    /**
     * StartTransaction : soit la suite d'un RemoteStart (idTag « APP-{session} »),
     * soit une recharge lancée à la borne avec un badge RFID.
     */
    public function startTransaction(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reference' => ['required', 'string'],
            'connectorId' => ['required', 'integer', 'min:1'],
            'idTag' => ['required', 'string'],
            'meterStart' => ['nullable', 'integer', 'min:0'],
        ]);

        $borne = Borne::where('reference', $data['reference'])->firstOrFail();
        $indexDebut = $data['meterStart'] ?? null;

        if ($sessionId = OcppClient::sessionDepuisIdTag($data['idTag'])) {
            $session = SessionRecharge::where('id', $sessionId)->where('borne_id', $borne->id)
                ->whereIn('etat', SessionRecharge::ETATS_ACTIFS)->first();
            if (! $session) {
                return response()->json(['sessionId' => null, 'status' => 'Invalid']);
            }
            $session->update(['transaction_ocpp_id' => (string) $session->id, 'index_debut_wh' => $indexDebut]);

            return response()->json(['sessionId' => $session->id, 'status' => 'Accepted']);
        }

        $badge = BadgeRfid::with('user')->where('uid', $data['idTag'])->first();
        $statut = $badge?->statutOcpp() ?? 'Invalid';
        if ($statut === 'Accepted' && $badge->user?->motifRefusRecharge()) {
            $statut = 'Blocked';
        }
        $connecteur = OcppClient::connecteurParNumero($borne, $data['connectorId']);

        if ($statut !== 'Accepted' || ! $connecteur) {
            return response()->json(['sessionId' => null, 'status' => $connecteur ? $statut : 'Invalid']);
        }

        try {
            $session = $this->sessions->demarrer($badge->user, $borne->id, $connecteur->id, null, 'rfid', $badge, commanderBorne: false);
        } catch (ValidationException $e) {
            return response()->json(['sessionId' => null, 'status' => 'ConcurrentTx', 'message' => collect($e->errors())->flatten()->first()]);
        }

        $session->update(['transaction_ocpp_id' => (string) $session->id, 'index_debut_wh' => $indexDebut]);
        $badge->update(['derniere_utilisation' => now()]);
        $badge->journaliser('recharge_demarree', 'Session #'.$session->id, $borne->id);

        return response()->json(['sessionId' => $session->id, 'status' => 'Accepted']);
    }

    /**
     * MeterValues : télémétrie de la session en cours. L'énergie est calculée à
     * partir de l'index du compteur (indexWh − meterStart) ; une mesure sans
     * index d'énergie conserve l'énergie déjà relevée.
     */
    public function meterValues(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reference' => ['required', 'string'],
            'sessionId' => ['required', 'integer'],
            'indexWh' => ['nullable', 'numeric', 'min:0'],
            'energieKwh' => ['nullable', 'numeric', 'min:0'],
            'puissanceKw' => ['nullable', 'numeric', 'min:0'],
            'pourcentageBatterie' => ['nullable', 'integer', 'between:0,100'],
        ]);

        $session = $this->sessionDeLaBorne($data['reference'], (int) $data['sessionId']);
        if ($session instanceof JsonResponse) {
            return $session;
        }

        $energie = $this->energieSession($session, $data['indexWh'] ?? null, $data['energieKwh'] ?? null);
        if ($energie !== null) {
            $session->energie_kwh = $energie;
        }
        $puissance = $this->puissancePlafonnee($session, $data['puissanceKw'] ?? null);
        $session->puissance_instantanee_kw = $session->etat === 'en_pause' ? 0 : $puissance;
        // Pendant une recharge la batterie ne se vide pas : une valeur plus basse est un bruit de mesure.
        if (isset($data['pourcentageBatterie'])) {
            $session->pourcentage_batterie = max($session->pourcentage_batterie ?? 0, $data['pourcentageBatterie']);
        }
        $session->prix = $this->tarification->calculer($session);
        $session->save();

        MesureRecharge::create([
            'session_recharge_id' => $session->id,
            'horodatage' => now(),
            'energie_kwh' => $session->energie_kwh,
            'puissance_kw' => $puissance,
            'pourcentage_batterie' => $data['pourcentageBatterie'] ?? null,
        ]);

        // Solde du wallet atteint : la recharge s'arrête d'elle-même (le client paie son solde exact).
        // L'ordre d'arrêt part après la réponse, pour ne pas bloquer le serveur OCPP qui attend celle-ci.
        if ($session->estActive() && $session->user && $session->prix >= (float) $session->user->solde_wallet) {
            $sessions = $this->sessions;
            dispatch(function () use ($sessions, $session) {
                $s = $session->fresh();
                if ($s?->estActive()) {
                    $s->update(['arret_solde' => true]);
                    $sessions->terminer($s);
                }
            })->afterResponse();
        }

        return response()->json(['message' => 'OK']);
    }

    /** StopTransaction émis par la borne elle-même (fin côté borne, badge, câble débranché). */
    public function stopTransaction(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reference' => ['required', 'string'],
            'sessionId' => ['required', 'integer'],
            'indexWh' => ['nullable', 'numeric', 'min:0'],
            'energieKwh' => ['nullable', 'numeric', 'min:0'],
        ]);

        $session = $this->sessionDeLaBorne($data['reference'], (int) $data['sessionId']);
        if ($session instanceof JsonResponse) {
            return $session;
        }

        $this->sessions->terminer(
            $session,
            $this->energieSession($session, $data['indexWh'] ?? null, $data['energieKwh'] ?? null),
            commanderBorne: false,
        );

        return response()->json(['message' => 'OK']);
    }

    /** FirmwareStatusNotification : progression d'une mise à jour (module 13). */
    public function firmwareStatus(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reference' => ['required', 'string'],
            'status' => ['required', 'string'],
        ]);

        $borne = Borne::where('reference', $data['reference'])->firstOrFail();
        $deploiement = DeploiementFirmware::with('firmware')
            ->where('borne_id', $borne->id)
            ->whereIn('statut', DeploiementFirmware::STATUTS_EN_COURS)
            ->latest()
            ->first();

        if (! $deploiement) {
            return response()->json(['message' => 'Aucun déploiement en cours'], 404);
        }

        $statut = [
            'Downloading' => 'telechargement',
            'Downloaded' => 'telecharge',
            'Installing' => 'installation',
            'Installed' => 'installe',
            'DownloadFailed' => 'echec',
            'InstallationFailed' => 'echec',
        ][$data['status']] ?? $deploiement->statut;

        $deploiement->update([
            'statut' => $statut,
            'message' => "Borne : {$data['status']}",
        ]);

        if ($statut === 'installe') {
            $borne->update(['version_firmware' => $deploiement->firmware->version]);
        } elseif ($statut === 'echec') {
            Alerte::lever($borne, 'erreur_ocpp', 'warning', "Échec de la mise à jour firmware {$deploiement->firmware->version} sur {$borne->nom}");
        }

        return response()->json(['message' => 'OK']);
    }

    /** DiagnosticsStatusNotification : suivi de l'envoi du fichier de diagnostic. */
    public function diagnosticsStatus(Request $request): JsonResponse
    {
        $data = $request->validate(['reference' => ['required', 'string'], 'status' => ['required', 'string']]);

        if ($data['status'] === 'UploadFailed') {
            $borne = Borne::where('reference', $data['reference'])->firstOrFail();
            Alerte::lever($borne, 'erreur_ocpp', 'info', "Échec de l'envoi des diagnostics de {$borne->nom}");
        }

        return response()->json(['message' => 'OK']);
    }

    /** Dépôt du fichier de diagnostic par la borne (URL signée transmise dans GetDiagnostics). */
    public function diagnosticsUpload(Request $request, Borne $borne): JsonResponse
    {
        $contenu = $request->hasFile('file') ? $request->file('file')->get() : $request->getContent();
        abort_if($contenu === '', 422, 'Fichier vide.');

        $nom = "diagnostic-{$borne->reference}-".now()->format('Ymd-His').'.log';
        $chemin = "documents/{$borne->id}/{$nom}";
        Storage::put($chemin, $contenu);

        Document::create([
            'borne_id' => $borne->id,
            'type' => 'diagnostic',
            'titre' => 'Diagnostic du '.now()->setTimezone(Parametre::get('fuseau_horaire', 'UTC'))->format('d/m/Y H:i'),
            'fichier' => $chemin,
            'nom_fichier' => $nom,
            'mime' => 'text/plain',
            'taille' => strlen($contenu),
        ]);

        return response()->json(['message' => 'Diagnostic reçu']);
    }

    /** Erreur protocolaire remontée par le serveur OCPP (CALLERROR, trame invalide…). */
    public function erreur(Request $request): JsonResponse
    {
        $data = $request->validate(['reference' => ['required', 'string'], 'message' => ['required', 'string', 'max:250']]);

        $borne = Borne::where('reference', $data['reference'])->first();
        if ($borne) {
            Alerte::lever($borne, 'erreur_ocpp', 'warning', "Erreur OCPP sur {$borne->nom} : {$data['message']}");
        }

        return response()->json(['message' => 'OK']);
    }

    /** Toute trame reçue prouve que la borne est joignable : état recalculé, alerte de déconnexion close. */
    private function remettreEnLigne(Borne $borne): void
    {
        $borne->dernier_heartbeat = now();
        $borne->deconnectee_le = null;
        if ($borne->etat === 'deconnectee') {
            $borne->etat = $borne->etatCalcule();
        }
        $borne->save();

        $borne->alertes()->where('type', 'borne_deconnectee')->where('resolue', false)
            ->update(['resolue' => true, 'resolue_le' => now()]);
    }

    /**
     * Session active appartenant à la borne émettrice : une borne ne peut ni
     * mesurer ni arrêter la recharge d'une autre borne.
     */
    private function sessionDeLaBorne(string $reference, int $sessionId): SessionRecharge|JsonResponse
    {
        $session = SessionRecharge::with(['borne', 'connecteur', 'tarif', 'user'])->find($sessionId);

        if (! $session || ! $session->estActive()) {
            return response()->json(['message' => 'Session inconnue ou terminée'], 404);
        }

        if ($session->borne->reference !== $reference) {
            if ($emettrice = Borne::where('reference', $reference)->first()) {
                Alerte::lever($emettrice, 'erreur_ocpp', 'critique', "{$emettrice->nom} a envoyé des données pour la session #{$sessionId} d'une autre borne");
            }

            return response()->json(['message' => "Cette session n'appartient pas à la borne"], 403);
        }

        return $session;
    }

    /** Énergie de la session en kWh : index du compteur − index de départ (ou valeur directe, compatibilité). */
    private function energieSession(SessionRecharge $session, ?float $indexWh, ?float $energieKwh): ?float
    {
        if ($indexWh !== null) {
            return round(max(0, $indexWh - ($session->index_debut_wh ?? 0)) / 1000, 3);
        }

        return $energieKwh;
    }

    /** La puissance mesurée ne peut dépasser la puissance nominale de la prise (au-delà : erreur de mesure). */
    private function puissancePlafonnee(SessionRecharge $session, ?float $puissanceKw): ?float
    {
        $nominale = $session->connecteur?->puissance_kw ?? $session->borne->puissance_kw;
        if ($puissanceKw === null || ! $nominale) {
            return $puissanceKw;
        }

        return round(min($puissanceKw, $nominale * self::TOLERANCE_PUISSANCE), 2);
    }

    private function leverAlerteErreur(Borne $borne, array $data): void
    {
        $code = $data['errorCode'] ?? 'NoError';
        $vendeur = strtolower(($data['vendorErrorCode'] ?? '').' '.($data['info'] ?? ''));

        if (str_contains($vendeur, 'door') || str_contains($vendeur, 'porte')) {
            Alerte::lever($borne, 'porte_ouverte', 'warning', "Porte / trappe ouverte sur {$borne->nom}");

            return;
        }

        if ($code === 'NoError' || $code === 'OtherError' && trim($vendeur) === '') {
            return;
        }

        [$type, $gravite] = self::ERREURS[$code] ?? ['erreur_ocpp', 'warning'];
        $libelle = [
            'surchauffe' => 'Surchauffe',
            'coupure_electrique' => 'Coupure / anomalie électrique',
            'defaut_materiel' => 'Défaut matériel',
            'erreur_ocpp' => 'Erreur OCPP',
        ][$type];

        Alerte::lever($borne, $type, $gravite, "{$libelle} sur {$borne->nom} ({$code}".(trim($vendeur) ? ' — '.trim($vendeur) : '').')');
    }
}
