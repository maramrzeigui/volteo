<?php

namespace App\Services\Paiement;

use App\Models\TransactionPaiement;
use Illuminate\Support\Facades\URL;

/**
 * Passerelle de test, sans prestataire : une page de paiement locale reproduit le parcours
 * (carte, Flouci, e-DINAR) avec des cartes de test. Jamais disponible en production.
 */
class TestPasserelle implements Passerelle
{
    /** Cartes de test : acceptée, refusée (fonds insuffisants), refusée (3-D Secure). */
    public const CARTES = [
        '4111111111111111' => 'reussie',
        '5555555555554444' => 'reussie',
        '4000000000000002' => 'echouee',
        '4000000000003220' => 'echouee',
    ];

    public function moyens(): array
    {
        return ['carte', 'flouci', 'edinar'];
    }

    public function initier(TransactionPaiement $transaction, string $urlRetour, string $urlWebhook): array
    {
        return [
            'url' => URL::temporarySignedRoute('paiement.test', now()->addMinutes(20), ['reference' => $transaction->reference]),
            'reference_externe' => 'TEST-'.strtoupper(substr(str_replace('-', '', $transaction->reference), 0, 12)),
        ];
    }

    public function verifier(TransactionPaiement $transaction): array
    {
        $statut = $transaction->reponse['resultat_test'] ?? 'en_cours';
        if ($statut === 'en_cours' && $transaction->created_at?->lt(now()->subMinutes(20))) {
            $statut = 'expiree';
        }

        return ['statut' => $statut, 'reponse' => $transaction->reponse ?? []];
    }
}
