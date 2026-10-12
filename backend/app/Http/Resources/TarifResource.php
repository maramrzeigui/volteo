<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TarifResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'nom' => $this->nom,
            // Tarif d'une station, ou tarif commun de la plateforme (stationId null).
            'stationId' => $this->station_id,
            'mode' => $this->mode,
            'prix' => $this->prix,
            'prixHeuresCreuses' => $this->prix_heures_creuses,
            'heuresCreusesDebut' => $this->heures_creuses_debut ? substr($this->heures_creuses_debut, 0, 5) : null,
            'heuresCreusesFin' => $this->heures_creuses_fin ? substr($this->heures_creuses_fin, 0, 5) : null,
            'fraisSession' => $this->frais_session,
            'special' => $this->special,
            'valideDu' => $this->valide_du?->format('Y-m-d'),
            'valideAu' => $this->valide_au?->format('Y-m-d'),
            'actif' => $this->actif,
            'description' => $this->description,
            'nbBornes' => $this->whenCounted('bornes'),
        ];
    }
}
