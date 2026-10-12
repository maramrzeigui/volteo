<?php

namespace App\Services\Paiement;

use App\Models\TransactionPaiement;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Flouci (developers.flouci.com) : portefeuille Flouci et cartes bancaires tunisiennes.
 * Documentation : docs.flouci.com/api-reference/generate-transaction et verify-transaction.
 */
class FlouciPasserelle implements Passerelle
{
    private const URL = 'https://developers.flouci.com/api/v2';

    public function __construct(private readonly string $public, private readonly string $prive) {}

    public function moyens(): array
    {
        return ['flouci', 'carte'];
    }

    public function initier(TransactionPaiement $transaction, string $urlRetour, string $urlWebhook): array
    {
        $r = $this->client()->post(self::URL.'/generate_payment', [
            'amount' => (string) $transaction->millimes(),
            'accept_card' => $transaction->moyen === 'carte',
            'success_link' => $urlRetour,
            'fail_link' => $urlRetour,
            'webhook' => $urlWebhook,
            'developer_tracking_id' => $transaction->reference,
            'session_timeout_secs' => 1200,
        ]);
        $json = $r->json();
        if (! $r->successful() || ! ($json['result']['success'] ?? false)) {
            throw new RuntimeException('Flouci : '.($json['result']['message'] ?? 'paiement refusé'));
        }

        return ['url' => $json['result']['link'], 'reference_externe' => $json['result']['payment_id'], 'reponse' => $json];
    }

    public function verifier(TransactionPaiement $transaction): array
    {
        $json = $this->client()->get(self::URL.'/verify_payment/'.$transaction->reference_externe)->json() ?? [];
        $statut = match ($json['result']['status'] ?? null) {
            'SUCCESS' => ($json['success'] ?? false) ? 'reussie' : 'en_cours',
            'FAILURE', 'SYSTEM_FAILURE' => 'echouee',
            'EXPIRED' => 'expiree',
            default => 'en_cours',
        };

        return ['statut' => $statut, 'reponse' => $json];
    }

    private function client()
    {
        return Http::timeout(20)->acceptJson()->withHeaders(['Authorization' => "Bearer {$this->public}:{$this->prive}"]);
    }
}
