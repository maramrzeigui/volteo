<?php

namespace App\Services\Paiement;

use App\Models\TransactionPaiement;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * ClicToPay (Société Monétique Tunisie) : cartes bancaires tunisiennes (CIB, Visa, Mastercard)
 * et internationales, avec 3-D Secure. API REST : register.do puis getOrderStatusExtended.do.
 */
class ClicToPayPasserelle implements Passerelle
{
    public function __construct(private readonly string $identifiant, private readonly string $motDePasse, private readonly string $urlApi) {}

    public function moyens(): array
    {
        return ['carte'];
    }

    public function initier(TransactionPaiement $transaction, string $urlRetour, string $urlWebhook): array
    {
        $json = $this->appel('register.do', [
            'orderNumber' => substr(str_replace('-', '', $transaction->reference), 0, 32),
            'amount' => $transaction->millimes(),
            'currency' => 788, // TND (ISO 4217)
            'returnUrl' => $urlRetour,
            'failUrl' => $urlRetour,
            'language' => 'fr',
            'description' => 'Volteo · '.$transaction->objet,
        ]);
        if (! empty($json['errorCode']) || empty($json['formUrl'])) {
            throw new RuntimeException('ClicToPay : '.($json['errorMessage'] ?? 'paiement refusé'));
        }

        return ['url' => $json['formUrl'], 'reference_externe' => $json['orderId'], 'reponse' => $json];
    }

    public function verifier(TransactionPaiement $transaction): array
    {
        $json = $this->appel('getOrderStatusExtended.do', ['orderId' => $transaction->reference_externe, 'language' => 'fr']);
        // orderStatus : 0 enregistrée, 1 pré-autorisée, 2 payée, 3 annulée, 4 remboursée, 5 3-D Secure en cours, 6 refusée.
        $statut = match ((int) ($json['orderStatus'] ?? -1)) {
            2 => 'reussie',
            3, 4, 6 => 'echouee',
            default => 'en_cours',
        };

        return ['statut' => $statut, 'reponse' => $json];
    }

    private function appel(string $methode, array $parametres): array
    {
        return Http::timeout(20)->asForm()->post(rtrim($this->urlApi, '/').'/'.$methode, [
            'userName' => $this->identifiant,
            'password' => $this->motDePasse,
            ...$parametres,
        ])->json() ?? [];
    }
}
