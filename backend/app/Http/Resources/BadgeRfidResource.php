<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Sortie alignée sur le type `BadgeRfid` de l'app mobile. */
class BadgeRfidResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'uid' => $this->uid,
            'libelle' => $this->libelle,
            'actif' => $this->actif && ! $this->bloque && ! $this->estExpire(),
            'bloque' => $this->bloque,
            'statut' => $this->statut(),
            'dateExpiration' => $this->date_expiration?->format('Y-m-d'),
        ];
    }
}
