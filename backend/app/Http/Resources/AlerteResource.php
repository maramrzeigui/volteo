<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AlerteResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'borneId' => $this->borne_id,
            'borneNom' => $this->borne?->nom,
            'type' => $this->type,
            'gravite' => $this->gravite,
            'message' => $this->message,
            'resolue' => $this->resolue,
            'resolueLe' => $this->resolue_le?->toIso8601String(),
            'resolueParNom' => Concerns::nomComplet($this->resoluePar),
            'priseEnChargeParNom' => Concerns::nomComplet($this->priseEnChargePar),
            'nbNotifications' => $this->whenCounted('notifications'),
            'createdAt' => $this->created_at->toIso8601String(),
        ];
    }
}
