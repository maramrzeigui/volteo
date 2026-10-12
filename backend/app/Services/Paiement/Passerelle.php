<?php

namespace App\Services\Paiement;

use App\Models\TransactionPaiement;

/** Passerelle de paiement : crée la page de paiement puis vérifie le résultat auprès du prestataire. */
interface Passerelle
{
    /** Moyens acceptés : carte, flouci, edinar. */
    public function moyens(): array;

    /**
     * Crée le paiement chez le prestataire.
     *
     * @return array{url: string, reference_externe: string, reponse?: array}
     */
    public function initier(TransactionPaiement $transaction, string $urlRetour, string $urlWebhook): array;

    /**
     * Interroge le prestataire (jamais de confiance dans le navigateur ou le webhook seul).
     *
     * @return array{statut: 'reussie'|'echouee'|'en_cours'|'expiree', reponse: array}
     */
    public function verifier(TransactionPaiement $transaction): array;
}
