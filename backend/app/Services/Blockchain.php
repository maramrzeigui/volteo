<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Client du pont blockchain (blockchain/pont.js). Le pont détient les portefeuilles des acteurs
 * et signe pour eux : fabricant:{id}, station:{id}, user:{id}.
 */
class Blockchain
{
    public function actif(): bool
    {
        return filled(config('services.blockchain.url'));
    }

    /** Crée (si besoin) le portefeuille d'un acteur et lui donne son rôle dans les contrats. */
    public function portefeuille(string $ref, ?string $role = null, ?string $nom = null): string
    {
        return $this->appel('post', '/portefeuilles', array_filter(['ref' => $ref, 'role' => $role, 'nom' => $nom]))['adresse'];
    }

    /** Crée le NFT de la batterie, détenu par le fabricant. */
    public function creerBatterie(string $refFabricant, array $batterie): array
    {
        return $this->appel('post', '/batteries', ['fabricant' => $refFabricant] + $batterie);
    }

    /** Transfère le NFT de la batterie (activation par le client, puis revente). */
    public function transferer(string $refDe, string $numSerie, string $refVers): array
    {
        return $this->appel('post', '/batteries/transfert', ['de' => $refDe, 'numSerie' => $numSerie, 'vers' => $refVers]);
    }

    public function enregistrerRecharge(string $refStation, array $recharge): array
    {
        return $this->appel('post', '/recharges', ['station' => $refStation] + $recharge);
    }

    /** Passeport complet lu dans la blockchain : fiche, propriétaire, interventions, recharges. */
    public function passeport(string $numSerie): array
    {
        return $this->appel('get', '/batteries/'.rawurlencode($numSerie));
    }

    public function etat(): array
    {
        return $this->appel('get', '/etat');
    }

    private function client(): PendingRequest
    {
        return Http::baseUrl(rtrim((string) config('services.blockchain.url'), '/'))
            ->withHeaders(['X-Pont-Secret' => (string) config('services.blockchain.secret')])
            ->acceptJson()
            ->timeout(30);
    }

    private function appel(string $methode, string $chemin, array $donnees = []): array
    {
        if (! $this->actif()) {
            throw new RuntimeException('La blockchain n’est pas configurée (BLOCKCHAIN_PONT_URL).');
        }
        try {
            $reponse = $methode === 'get' ? $this->client()->get($chemin) : $this->client()->post($chemin, $donnees);
        } catch (ConnectionException) {
            throw new RuntimeException('Le pont blockchain est injoignable (npm run pont dans blockchain/).');
        }
        if ($reponse->failed()) {
            throw new RuntimeException((string) ($reponse->json('message') ?? 'Erreur blockchain'), $reponse->status());
        }

        return $reponse->json();
    }
}
