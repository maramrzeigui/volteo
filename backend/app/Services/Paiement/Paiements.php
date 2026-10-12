<?php

namespace App\Services\Paiement;

use App\Models\Abonnement;
use App\Models\AuditLog;
use App\Models\Facture;
use App\Models\Paiement;
use App\Models\TransactionPaiement;
use App\Models\User;
use App\Services\Abonnements;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Paiements en ligne : choix de la passerelle selon le moyen (carte bancaire, Flouci, e-DINAR),
 * création de la transaction, puis confirmation après vérification auprès du prestataire.
 * L'effet (crédit du wallet, règlement, abonnement) est appliqué une seule fois.
 */
class Paiements
{
    public const LIBELLES = ['carte' => 'Carte bancaire', 'flouci' => 'Flouci', 'edinar' => 'e-DINAR / D17'];

    /** Passerelles configurées (clés dans .env), par ordre de préférence pour chaque moyen. */
    public function passerelles(): array
    {
        $c = config('services.paiement');
        $liste = [];
        if (! empty($c['clictopay']['identifiant']) && ! empty($c['clictopay']['mot_de_passe'])) {
            $liste['clictopay'] = new ClicToPayPasserelle($c['clictopay']['identifiant'], $c['clictopay']['mot_de_passe'], $c['clictopay']['url']);
        }
        if (! empty($c['flouci']['public']) && ! empty($c['flouci']['prive'])) {
            $liste['flouci'] = new FlouciPasserelle($c['flouci']['public'], $c['flouci']['prive']);
        }
        if (! empty($c['konnect']['cle']) && ! empty($c['konnect']['portefeuille'])) {
            $liste['konnect'] = new KonnectPasserelle($c['konnect']['cle'], $c['konnect']['portefeuille'], (bool) $c['konnect']['production']);
        }
        if (! $liste && $this->modeTest()) {
            $liste['test'] = new TestPasserelle;
        }

        return $liste;
    }

    public function modeTest(): bool
    {
        return config('services.paiement.mode') === 'test' && ! app()->isProduction();
    }

    /** Moyens proposés au client, avec la passerelle qui les traite. */
    public function moyens(): array
    {
        $moyens = [];
        foreach ($this->passerelles() as $nom => $p) {
            foreach ($p->moyens() as $m) {
                $moyens[$m] ??= ['moyen' => $m, 'libelle' => self::LIBELLES[$m], 'passerelle' => $nom];
            }
        }

        return array_values(array_intersect_key($moyens, array_flip(['carte', 'flouci', 'edinar'])) + $moyens);
    }

    public function passerelle(string $nom): Passerelle
    {
        return $this->passerelles()[$nom] ?? throw ValidationException::withMessages(['moyen' => ['Ce moyen de paiement n’est pas disponible.']]);
    }

    /** Crée la transaction et la page de paiement chez le prestataire. */
    public function initier(User $user, string $objet, float $montant, string $moyen, ?int $objetId, string $canal): TransactionPaiement
    {
        $choix = collect($this->moyens())->firstWhere('moyen', $moyen)
            ?? throw ValidationException::withMessages(['moyen' => ['Ce moyen de paiement n’est pas disponible.']]);

        $transaction = TransactionPaiement::create([
            'reference' => (string) Str::uuid(),
            'user_id' => $user->id,
            'objet' => $objet,
            'objet_id' => $objetId,
            'montant' => round($montant, 3),
            'passerelle' => $choix['passerelle'],
            'moyen' => $moyen,
            'canal' => $canal,
        ]);

        try {
            $r = $this->passerelle($choix['passerelle'])->initier(
                $transaction,
                route('paiement.retour', ['reference' => $transaction->reference]),
                route('paiement.webhook', ['passerelle' => $choix['passerelle']]),
            );
        } catch (Throwable $e) {
            $transaction->update(['statut' => 'echouee', 'reponse' => ['erreur' => $e->getMessage()]]);
            report($e);
            throw ValidationException::withMessages(['moyen' => ['Le service de paiement est momentanément indisponible. Réessayez dans un instant.']]);
        }

        $transaction->update(['url_paiement' => $r['url'], 'reference_externe' => $r['reference_externe'], 'reponse' => $r['reponse'] ?? null]);
        AuditLog::record($user->id, 'paiement_initie', 'transaction:'.$transaction->id, "{$transaction->montant} DT via {$transaction->passerelle} ({$moyen})");

        return $transaction;
    }

    /** Vérifie auprès du prestataire et applique le résultat (idempotent). */
    public function confirmer(TransactionPaiement $transaction): TransactionPaiement
    {
        if ($transaction->statut !== 'en_cours') {
            return $transaction;
        }
        $verif = $this->passerelle($transaction->passerelle)->verifier($transaction);
        if ($verif['statut'] === 'en_cours') {
            return $transaction;
        }

        return DB::transaction(function () use ($transaction, $verif) {
            $t = TransactionPaiement::lockForUpdate()->findOrFail($transaction->id);
            if ($t->statut !== 'en_cours') {
                return $t;
            }
            $t->update(['statut' => $verif['statut'], 'reponse' => array_merge($t->reponse ?? [], ['verification' => $verif['reponse']]), 'confirmee_le' => now()]);
            if ($verif['statut'] === 'reussie') {
                $this->appliquer($t);
            }

            return $t;
        });
    }

    private function appliquer(TransactionPaiement $t): void
    {
        $user = User::lockForUpdate()->findOrFail($t->user_id);
        $reference = strtoupper($t->passerelle).'-'.$t->reference_externe;

        match ($t->objet) {
            'recharge_wallet' => (function () use ($user, $t, $reference) {
                $user->increment('solde_wallet', $t->montant);
                Paiement::create(['user_id' => $user->id, 'montant' => $t->montant, 'methode' => 'topup_'.$t->moyen, 'statut' => 'paye', 'regle_le' => now(), 'reference_psp' => $reference]);
            })(),
            'reglement' => (function () use ($t, $reference) {
                $paiement = Paiement::withoutGlobalScopes()->lockForUpdate()->find($t->objet_id);
                if ($paiement && $paiement->statut === 'en_attente') {
                    $paiement->update(['statut' => 'paye', 'methode' => $t->moyen, 'regle_le' => now(), 'reference_psp' => $reference]);
                    Facture::where('session_recharge_id', $paiement->session_recharge_id)->update(['statut' => 'payee']);
                }
            })(),
            'abonnement' => app(Abonnements::class)->souscrire($user, Abonnement::findOrFail($t->objet_id), $t->moyen, false, $reference),
        };

        AuditLog::record($user->id, 'paiement_confirme', 'transaction:'.$t->id, "{$t->montant} DT via {$t->passerelle}");
    }
}
