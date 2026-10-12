<?php

namespace App\Services;

use App\Models\Alerte;
use App\Models\Borne;
use App\Models\DeploiementFirmware;
use App\Models\SessionRecharge;

use function Illuminate\Support\defer;

/**
 * Diffusion des changements d'état vers le back-office (WebSocket, module 4).
 * L'envoi est différé après la réponse HTTP pour ne pas ralentir l'API.
 */
class TempsReel
{
    public static function actif(): bool
    {
        return (bool) config('services.temps_reel.actif', true);
    }

    private static function envoyer(string $evenement, array $donnees): void
    {
        if (! self::actif()) {
            return;
        }

        defer(fn () => app(OcppClient::class)->diffuser($evenement, $donnees));
    }

    public static function borne(Borne $borne): void
    {
        self::envoyer('borne.maj', [
            'id' => $borne->id,
            'etat' => $borne->etat,
            'dernierHeartbeat' => $borne->dernier_heartbeat?->toIso8601String(),
            'temperatureC' => $borne->temperature_c,
        ]);
    }

    public static function session(SessionRecharge $session): void
    {
        self::envoyer('session.maj', [
            'id' => $session->id,
            'userId' => $session->user_id,
            'borneId' => $session->borne_id,
            'etat' => $session->etat,
            'energieKwh' => $session->energie_kwh,
            'puissanceKw' => $session->puissance_instantanee_kw,
            'pourcentageBatterie' => $session->pourcentage_batterie,
            'prix' => $session->prix,
        ]);
    }

    public static function alerte(Alerte $alerte): void
    {
        self::envoyer('alerte.nouvelle', [
            'id' => $alerte->id,
            'borneId' => $alerte->borne_id,
            'borneNom' => $alerte->borne?->nom,
            'type' => $alerte->type,
            'gravite' => $alerte->gravite,
            'message' => $alerte->message,
        ]);
    }

    public static function firmware(DeploiementFirmware $deploiement): void
    {
        self::envoyer('firmware.maj', [
            'id' => $deploiement->id,
            'borneId' => $deploiement->borne_id,
            'statut' => $deploiement->statut,
        ]);
    }
}
