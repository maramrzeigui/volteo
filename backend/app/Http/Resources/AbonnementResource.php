<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AbonnementResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'nom' => $this->nom,
            'description' => $this->description,
            'prixMensuel' => $this->prix_mensuel,
            'remisePourcent' => $this->remise_pourcent,
            'kwhInclus' => $this->kwh_inclus,
            'actif' => $this->actif,
            'nbAbonnes' => $this->whenCounted('souscriptions_actives'),
        ];
    }
}
