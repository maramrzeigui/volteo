<?php

namespace App\Services\Paiement;

use App\Models\TransactionPaiement;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Konnect (konnect.network) : carte bancaire, e-DINAR (La Poste) et portefeuille Konnect.
 * API v2 « konnect-gateway » : POST /payments/init-payment, GET /payments/{paymentRef}.
 */
class KonnectPasserelle implements Passerelle
{
    public function __construct(private readonly string $cleApi, private readonly string $portefeuille, private readonly bool $production) {}

    public function moyens(): array
    {
        return ['carte', 'edinar'];
    }

    public function initier(TransactionPaiement $transaction, string $urlRetour, string $urlWebhook): array
    {
        $user = $transaction->user;
        $r = $this->client()->post($this->url().'/payments/init-payment', [
            'receiverWalletId' => $this->portefeuille,
            'token' => 'TND',
            'amount' => $transaction->millimes(),
            'type' => 'immediate',
            'description' => 'Volteo · '.$transaction->objet,
            'acceptedPaymentMethods' => $transaction->moyen === 'edinar' ? ['e-DINAR'] : ['bank_card'],
            'lifespan' => 20,
            'checkoutForm' => false,
            'addPaymentFeesToAmount' => false,
            'firstName' => $user?->prenom,
            'lastName' => $user?->nom,
            'email' => $user?->email,
            'orderId' => $transaction->reference,
            'webhook' => $urlWebhook,
            'successUrl' => $urlRetour,
            'failUrl' => $urlRetour,
            'theme' => 'dark',
        ]);
        if (! $r->successful() || ! $r->json('payUrl')) {
            throw new RuntimeException('Konnect : '.($r->json('errors.0.message') ?? $r->json('message') ?? 'paiement refusé'));
        }

        return ['url' => $r->json('payUrl'), 'reference_externe' => $r->json('paymentRef'), 'reponse' => $r->json()];
    }

    public function verifier(TransactionPaiement $transaction): array
    {
        $json = $this->client()->get($this->url().'/payments/'.$transaction->reference_externe)->json() ?? [];
        $statut = match ($json['payment']['status'] ?? null) {
            'completed' => 'reussie',
            'failed', 'canceled' => 'echouee',
            'expired' => 'expiree',
            default => 'en_cours',
        };

        return ['statut' => $statut, 'reponse' => $json];
    }

    private function url(): string
    {
        return $this->production ? 'https://api.konnect.network/api/v2' : 'https://api.preprod.konnect.network/api/v2';
    }

    private function client()
    {
        return Http::timeout(20)->acceptJson()->withHeaders(['x-api-key' => $this->cleApi]);
    }
}
