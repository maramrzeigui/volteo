<?php

namespace App\Services;

use App\Models\BadgeRfid;
use App\Models\Connecteur;
use App\Models\Facture;
use App\Models\Paiement;
use App\Models\Reservation;
use App\Models\SessionRecharge;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Module 5 — cycle de vie complet d'une session de recharge :
 * création, début, pause, reprise, fin et annulation, quelle que soit
 * l'origine (application, badge RFID à la borne, back-office).
 */
class GestionSessions
{
    /** Message affiché au client selon l'état de la borne qui refuse la recharge. */
    private const MESSAGES_INDISPONIBILITE = [
        'deconnectee' => 'Cette borne est hors ligne pour le moment. Choisissez une autre borne ou réessayez plus tard.',
        'indisponible' => 'Cette borne s’est déclarée indisponible.',
        'hors_service' => 'Cette borne est hors service.',
        'maintenance' => 'Cette borne est en maintenance.',
        'defaut' => 'Cette borne signale un défaut technique.',
    ];

    public function __construct(
        private readonly OcppClient $ocpp,
        private readonly Tarification $tarification,
    ) {}

    public function demarrer(
        User $user,
        int $borneId,
        int $connecteurId,
        ?int $vehiculeId = null,
        string $origine = 'application',
        ?BadgeRfid $badge = null,
        bool $commanderBorne = true,
    ): SessionRecharge {
        Reservation::expirerPerimees();

        $session = DB::transaction(function () use ($user, $borneId, $connecteurId, $vehiculeId, $origine, $badge, $commanderBorne) {
            $connecteur = Connecteur::where('id', $connecteurId)
                ->where('borne_id', $borneId)
                ->lockForUpdate()
                ->firstOrFail();
            $borne = $connecteur->borne;

            if ($borne->source === 'publique') {
                throw ValidationException::withMessages([
                    'borne_id' => ["Borne publique d'un autre opérateur : la recharge se lance depuis la borne ou l'application de l'opérateur."],
                ]);
            }

            if (! $borne->accepteRecharge()) {
                throw ValidationException::withMessages([
                    'borne_id' => [self::MESSAGES_INDISPONIBILITE[$borne->etat] ?? "Cette borne n'accepte pas de recharge pour le moment."],
                ]);
            }

            if (! $user->actif) {
                throw ValidationException::withMessages(['user_id' => ['Ce compte est désactivé.']]);
            }

            // Paiement garanti : pas de recharge sans solde suffisant ni avec une dette en cours.
            if ($motif = $user->motifRefusRecharge()) {
                throw ValidationException::withMessages(['solde' => [$motif]]);
            }

            // Une prise réservée ne peut être démarrée que par l'auteur de la réservation.
            $reservation = $connecteur->etat === 'reserve'
                ? Reservation::where('connecteur_id', $connecteur->id)
                    ->where('user_id', $user->id)
                    ->where('statut', 'active')
                    ->where('expire_le', '>', now())
                    ->first()
                : null;

            // Démarrage à la borne (badge) : la prise est déjà passée « occupée » via
            // StatusNotification(Preparing) avant le StartTransaction.
            $preparation = ! $commanderBorne
                && $connecteur->etat === 'occupe'
                && ! SessionRecharge::where('connecteur_id', $connecteur->id)->whereIn('etat', SessionRecharge::ETATS_ACTIFS)->exists();

            if ($connecteur->etat !== 'disponible' && ! $reservation && ! $preparation) {
                throw ValidationException::withMessages([
                    'connecteur_id' => ["Ce connecteur n'est pas disponible."],
                ]);
            }

            if ($user->sessions()->whereIn('etat', SessionRecharge::ETATS_ACTIFS)->exists()) {
                throw ValidationException::withMessages([
                    'session' => ['Une recharge est déjà en cours.'],
                ]);
            }

            $reservation?->update(['statut' => 'utilisee']);
            $connecteur->update(['etat' => 'occupe']);
            $borne->update(['etat' => 'occupee']);

            return SessionRecharge::create([
                'user_id' => $user->id,
                'borne_id' => $borneId,
                'connecteur_id' => $connecteurId,
                'vehicule_id' => $vehiculeId ?? $user->vehicules()->value('id'),
                'tarif_id' => $this->tarification->tarifApplicable($borne)?->id,
                'badge_rfid_id' => $badge?->id,
                'origine' => $origine,
                'date_debut' => now(),
                'energie_kwh' => 0,
                'prix' => 0,
                'etat' => 'en_cours',
            ]);
        });

        // Hors transaction. La borne connectée qui refuse (ou qui n'est en fait plus
        // connectée) annule la session. Serveur OCPP éteint : en développement la
        // session démarre quand même (mode simulation), en production elle est annulée.
        if ($commanderBorne) {
            $reponse = $this->ocpp->remoteStart($session->borne, $session->connecteur, $session->id);
            $raison = $reponse['raison'] ?? null;

            if (! $reponse['ok'] && ($raison !== 'injoignable' || app()->isProduction())) {
                $this->annulerSansCommande($session, 'Démarrage refusé : '.$reponse['message']);
                if ($raison === 'hors_ligne') {
                    $session->borne->update(['etat' => 'deconnectee', 'deconnectee_le' => now()]);
                }

                throw ValidationException::withMessages([
                    'borne_id' => [$raison === 'hors_ligne'
                        ? 'La borne ne répond pas : elle semble hors ligne. Réessayez dans quelques instants.'
                        : 'La borne a refusé le démarrage. Vérifiez que le câble est bien branché, puis réessayez.'],
                ]);
            }
        }

        return $session->load(['borne', 'connecteur']);
    }

    /**
     * Fin de recharge : prix final (jamais plus que le solde du wallet), libération de la prise,
     * paiement wallet et facture. Le client paie exactement ce qu'il a consommé, dans la limite de son solde.
     */
    public function terminer(SessionRecharge $session, ?float $energieFinale = null, bool $commanderBorne = true): SessionRecharge
    {
        $session = DB::transaction(function () use ($session, $energieFinale) {
            // Verrou : un arrêt depuis l'app et un StopTransaction simultané de la
            // borne ne doivent produire qu'une seule fin de session et une seule facture.
            $session = SessionRecharge::with(['borne', 'connecteur', 'tarif', 'user'])
                ->lockForUpdate()
                ->findOrFail($session->id);

            if (! $session->estActive()) {
                abort(409, 'Session déjà terminée.');
            }

            if ($session->etat === 'en_pause' && $session->pause_le) {
                $session->pause_secondes += (int) $session->pause_le->diffInSeconds(now());
                $session->pause_le = null;
            }
            if ($energieFinale !== null) {
                $session->energie_kwh = $energieFinale;
            }
            $session->etat = 'terminee';
            $session->date_fin = now();
            $session->puissance_instantanee_kw = null;
            $session->prix = $this->tarification->calculer($session);
            // Recharge au solde exact : le montant ne dépasse jamais ce que le wallet contient.
            $solde = round((float) $session->user->solde_wallet, 2);
            if ($session->prix > $solde) {
                $session->prix = max(0, $solde);
                $session->arret_solde = true;
            }
            $session->save();

            $this->libererConnecteur($session);
            $this->facturer($session);

            return $session;
        });

        if ($commanderBorne) {
            $this->ocpp->remoteStop($session->borne, $session->id);
        }

        return $session->load(['borne', 'connecteur']);
    }

    public function annuler(SessionRecharge $session, string $motif): SessionRecharge
    {
        if (! $session->estActive()) {
            abort(409, 'Seule une session en cours peut être annulée.');
        }

        DB::transaction(function () use ($session, $motif) {
            $session->update([
                'etat' => 'annulee',
                'date_fin' => now(),
                'prix' => 0,
                'puissance_instantanee_kw' => null,
                'pause_le' => null,
                'motif_annulation' => $motif,
            ]);
            $this->libererConnecteur($session);
        });

        $this->ocpp->remoteStop($session->borne, $session->id);

        return $session->load(['borne', 'connecteur']);
    }

    /** Annulation sans commande à la borne (démarrage refusé : rien n'a commencé côté borne). */
    private function annulerSansCommande(SessionRecharge $session, string $motif): void
    {
        DB::transaction(function () use ($session, $motif) {
            $session->update([
                'etat' => 'annulee',
                'date_fin' => now(),
                'prix' => 0,
                'motif_annulation' => mb_substr($motif, 0, 250),
            ]);
            $this->libererConnecteur($session);
        });
    }

    /** Pause : la borne reçoit un profil de charge à 0 kW (SetChargingProfile). */
    public function mettreEnPause(SessionRecharge $session): array
    {
        abort_unless($session->etat === 'en_cours', 409, 'Seule une session en cours peut être mise en pause.');

        $session->update(['etat' => 'en_pause', 'pause_le' => now(), 'puissance_instantanee_kw' => 0]);

        return $this->ocpp->limiterPuissance($session->borne, $session->connecteur, 0);
    }

    public function reprendre(SessionRecharge $session): array
    {
        abort_unless($session->etat === 'en_pause', 409, "Cette session n'est pas en pause.");

        $session->update([
            'etat' => 'en_cours',
            'pause_secondes' => $session->pause_secondes + ($session->pause_le ? (int) $session->pause_le->diffInSeconds(now()) : 0),
            'pause_le' => null,
        ]);

        return $this->ocpp->limiterPuissance($session->borne, $session->connecteur, null);
    }

    private function libererConnecteur(SessionRecharge $session): void
    {
        $session->connecteur->update(['etat' => 'disponible']);

        $borne = $session->borne;
        if ($borne->etat === 'occupee' && ! $borne->connecteurs()->where('etat', 'occupe')->exists()) {
            $borne->update(['etat' => 'disponible']);
        }
    }

    private function facturer(SessionRecharge $session): void
    {
        if ($session->prix <= 0 || $session->paiement()->exists()) {
            return;
        }

        $user = $session->user()->lockForUpdate()->first();
        // Le prix a été plafonné au solde : le paiement est toujours réglé, jamais « en attente ».
        $montant = min($session->prix, max(0, (float) $user->solde_wallet));
        $user->decrement('solde_wallet', $montant);

        Paiement::create([
            'user_id' => $user->id,
            'session_recharge_id' => $session->id,
            'montant' => $montant,
            'methode' => 'wallet',
            'statut' => 'paye',
            'regle_le' => now(),
        ]);

        Facture::emettre($session)->update(['statut' => 'payee']);
    }
}
