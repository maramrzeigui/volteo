<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PanneResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'borneId' => $this->borne_id,
            'borneNom' => $this->borne?->nom,
            'connecteurId' => $this->connecteur_id,
            'alerteId' => $this->alerte_id,
            'type' => $this->type,
            'gravite' => $this->gravite,
            'description' => $this->description,
            'statut' => $this->statut,
            'signaleParNom' => Concerns::nomComplet($this->signaleur),
            'resolueLe' => $this->resolue_le?->toIso8601String(),
            'ordresTravail' => $this->whenLoaded('maintenances', fn () => $this->maintenances->map(fn ($m) => [
                'id' => $m->id, 'reference' => $m->reference, 'statut' => $m->statut,
            ])),
            'createdAt' => $this->created_at->toIso8601String(),
        ];
    }
}
