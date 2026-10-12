<?php

namespace App\Services;

use App\Http\Controllers\Api\WalletController;
use App\Models\Abonnement;
use App\Models\AuditLog;
use App\Models\Paiement;
use App\Models\Souscription;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Souscription, renouvellement et expiration des abonnements. */
class Abonnements
{
    public function souscrire(User $user, Abonnement $abonnement, string $methode = 'wallet', bool $offert = false, ?string $referencePsp = null): Souscription
    {
        // Paiement en ligne : déjà encaissé par la passerelle (référence fournie).
        if (! $offert && $methode !== 'wallet' && ! $referencePsp) {
            WalletController::verifierPaiementCarteDisponible();
        }

        return DB::transaction(function () use ($user, $abonnement, $methode, $offert, $referencePsp) {
            $user = User::lockForUpdate()->findOrFail($user->id);

            if ($user->souscriptionActive()) {
                throw ValidationException::withMessages(['abonnement_id' => ['Un abonnement est déjà actif.']]);
            }

            if (! $offert && $methode === 'wallet') {
                if ((float) $user->solde_wallet < $abonnement->prix_mensuel) {
                    throw ValidationException::withMessages(['methode' => ['Solde du wallet insuffisant pour cet abonnement.']]);
                }
                $user->decrement('solde_wallet', $abonnement->prix_mensuel);
            }

            $souscription = Souscription::create([
                'user_id' => $user->id,
                'abonnement_id' => $abonnement->id,
                'date_debut' => today(),
                'date_fin' => today()->addMonthNoOverflow()->subDay(),
                'statut' => 'active',
            ]);

            if (! $offert && $abonnement->prix_mensuel > 0) {
                Paiement::create([
                    'user_id' => $user->id,
                    'souscription_id' => $souscription->id,
                    'montant' => $abonnement->prix_mensuel,
                    'methode' => $methode,
                    'statut' => 'paye',
                    'regle_le' => now(),
                    'reference_psp' => $referencePsp ?? ($methode === 'carte' ? WalletController::referenceSandbox() : null),
                ]);
            }

            return $souscription;
        });
    }

    /**
     * Tâche quotidienne : expire les abonnements échus et renouvelle ceux en
     * renouvellement automatique si le wallet le permet.
     *
     * @return array{renouveles: int, expires: int}
     */
    public function traiterEcheances(): array
    {
        $bilan = ['renouveles' => 0, 'expires' => 0];

        Souscription::with(['abonnement', 'user'])
            ->where('statut', 'active')
            ->whereDate('date_fin', '<', today())
            ->get()
            ->each(function (Souscription $s) use (&$bilan) {
                $s->update(['statut' => 'expiree']);

                if ($s->renouvellement_auto && $s->abonnement->actif) {
                    try {
                        $this->souscrire($s->user, $s->abonnement);
                        $bilan['renouveles']++;
                        AuditLog::record(null, 'renouvellement_abonnement', 'user:'.$s->user_id, $s->abonnement->nom);

                        return;
                    } catch (ValidationException) {
                        // Solde insuffisant : l'abonnement expire.
                    }
                }
                $bilan['expires']++;
            });

        return $bilan;
    }
}
