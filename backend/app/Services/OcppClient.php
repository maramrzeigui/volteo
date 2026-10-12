<?php

namespace App\Services;

use App\Models\Borne;
use App\Models\Connecteur;
use Illuminate\Support\Facades\Http;

/**
 * Client HTTP vers le serveur OCPP (ocpp-server/, port 9221).
 * Le serveur OCPP relaie ensuite la commande à la borne via WebSocket OCPP 1.6J.
 */
class OcppClient
{
    private function url(string $path): string
    {
        return rtrim(config('services.ocpp.url'), '/').$path;
    }

    /** @return array{ok: bool, message: string, donnees?: mixed, raison?: string} */
    private function post(string $path, array $payload, int $timeout = 8): array
    {
        try {
            $response = Http::timeout($timeout)
                ->withHeaders(['X-Ocpp-Secret' => config('services.ocpp.secret')])
                ->post($this->url($path), $payload);

            if ($response->successful()) {
                return [
                    'ok' => true,
                    'message' => $response->json('message') ?? 'Commande envoyée à la borne.',
                    'donnees' => $response->json('donnees'),
                ];
            }

            return [
                'ok' => false,
                'message' => $response->json('message') ?? 'La borne a refusé la commande.',
                // hors_ligne : la borne n'est pas connectée ; refus : elle a répondu non.
                'raison' => $response->json('raison') ?? 'refus',
            ];
        } catch (\Throwable) {
            return ['ok' => false, 'message' => 'Serveur OCPP injoignable — commande non transmise.', 'raison' => 'injoignable'];
        }
    }

    /** Numéro OCPP (1..n) d'un connecteur sur sa borne. */
    public static function numero(Connecteur $connecteur): int
    {
        $ids = Connecteur::where('borne_id', $connecteur->borne_id)->orderBy('id')->pluck('id')->all();

        return array_search($connecteur->id, $ids, true) + 1;
    }

    /** Connecteur correspondant au numéro OCPP (1..n) d'une borne. */
    public static function connecteurParNumero(Borne $borne, int $numero): ?Connecteur
    {
        return $numero > 0 ? $borne->connecteurs()->orderBy('id')->skip($numero - 1)->first() : null;
    }

    /** Préfixe de l'idTag d'une recharge lancée depuis l'application (RemoteStartTransaction). */
    public const PREFIXE_SESSION = 'APP-';

    public static function idTagSession(int $sessionId): string
    {
        return self::PREFIXE_SESSION.$sessionId;
    }

    /** Identifiant de session encodé dans un idTag « APP-{id} », sinon null (badge RFID). */
    public static function sessionDepuisIdTag(string $idTag): ?int
    {
        return preg_match('/^'.self::PREFIXE_SESSION.'(\d+)$/', $idTag, $m) ? (int) $m[1] : null;
    }

    /** Références des bornes actuellement connectées en WebSocket. */
    public function bornesConnectees(): ?array
    {
        try {
            $response = Http::timeout(2)
                ->withHeaders(['X-Ocpp-Secret' => config('services.ocpp.secret')])
                ->get($this->url('/status'));

            return $response->successful() ? $response->json('bornesConnectees', []) : null;
        } catch (\Throwable) {
            return null;
        }
    }

    public function remoteStart(Borne $borne, Connecteur $connecteur, int $sessionId): array
    {
        return $this->post('/commands/remote-start', [
            'reference' => $borne->reference,
            'connecteurId' => self::numero($connecteur),
            'sessionId' => $sessionId,
            'idTag' => self::idTagSession($sessionId),
        ]);
    }

    public function remoteStop(Borne $borne, int $sessionId): array
    {
        return $this->post('/commands/remote-stop', [
            'reference' => $borne->reference,
            'sessionId' => $sessionId,
        ]);
    }

    public function reset(Borne $borne, string $type = 'Soft'): array
    {
        return $this->post('/commands/reset', ['reference' => $borne->reference, 'type' => $type]);
    }

    public function unlock(Borne $borne, Connecteur $connecteur): array
    {
        return $this->post('/commands/unlock', [
            'reference' => $borne->reference,
            'connecteurId' => self::numero($connecteur),
        ]);
    }

    /** SetChargingProfile (limite en kW, 0 = pause) ou ClearChargingProfile (null = reprise). */
    public function limiterPuissance(Borne $borne, Connecteur $connecteur, ?float $limiteKw): array
    {
        return $this->post('/commands/charging-limit', [
            'reference' => $borne->reference,
            'connecteurId' => self::numero($connecteur),
            'limiteW' => $limiteKw === null ? null : (int) round($limiteKw * 1000),
        ]);
    }

    public function changeConfiguration(Borne $borne, string $cle, string $valeur): array
    {
        return $this->post('/commands/change-configuration', [
            'reference' => $borne->reference,
            'key' => $cle,
            'value' => $valeur,
        ]);
    }

    public function getConfiguration(Borne $borne): array
    {
        return $this->post('/commands/get-configuration', ['reference' => $borne->reference]);
    }

    public function updateFirmware(Borne $borne, string $url): array
    {
        return $this->post('/commands/update-firmware', [
            'reference' => $borne->reference,
            'location' => $url,
            'retrieveDate' => now()->toIso8601String(),
        ]);
    }

    public function getDiagnostics(Borne $borne, string $url): array
    {
        return $this->post('/commands/get-diagnostics', [
            'reference' => $borne->reference,
            'location' => $url,
        ]);
    }

    /** Pousse un événement temps réel vers les navigateurs connectés (relais WebSocket du serveur OCPP). */
    /** Pilotage du simulateur de bornes SAP (démonstration) : badge, câble, démarrage, arrêt, journal. */
    public function simulateur(string $action, array $payload): array
    {
        return $this->post('/simulateur/'.$action, $payload, 12);
    }

    public function diffuser(string $evenement, array $donnees): void
    {
        try {
            Http::timeout(1)
                ->withHeaders(['X-Ocpp-Secret' => config('services.ocpp.secret')])
                ->post($this->url('/broadcast'), ['evenement' => $evenement, 'donnees' => $donnees]);
        } catch (\Throwable) {
            // Temps réel « best effort » : le front garde un rafraîchissement périodique.
        }
    }
}
