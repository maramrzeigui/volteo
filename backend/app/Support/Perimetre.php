<?php

namespace App\Support;

/**
 * Périmètre de données de la requête en cours. Le personnel d'une station ne voit que
 * les données de sa station ; le super-admin (et le personnel plateforme) voit tout.
 * Activé uniquement par le middleware du back-office : l'application client, l'API OCPP
 * et les tâches planifiées ne sont jamais restreintes.
 */
class Perimetre
{
    private ?int $station = null;

    public function limiter(?int $station): void
    {
        $this->station = $station;
    }

    public function station(): ?int
    {
        return $this->station;
    }

    public function actif(): bool
    {
        return $this->station !== null;
    }
}
