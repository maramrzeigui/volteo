<?php

namespace App\Http\Resources;

use App\Services\OcppClient;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Sortie alignée sur le type `Connecteur` de l'app mobile. */
class ConnecteurResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'borneId' => $this->borne_id,
            'numero' => $this->when($request->is('api/v1/admin/*'), fn () => OcppClient::numero($this->resource)),
            'type' => $this->type,
            'courant' => $this->courant(),
            'puissanceKw' => $this->puissance_kw,
            'etat' => $this->etat,
        ];
    }
}
