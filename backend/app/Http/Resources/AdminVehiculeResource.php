<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminVehiculeResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'userId' => $this->user_id,
            'userNom' => Concerns::nomComplet($this->user),
            'marque' => $this->marque,
            'modele' => $this->modele,
            'immatriculation' => $this->immatriculation,
            'typeConnecteur' => $this->type_connecteur,
            'capaciteBatterieKwh' => $this->capacite_batterie_kwh,
            'nbSessions' => $this->whenCounted('sessions'),
            'energieTotaleKwh' => $this->when(isset($this->energie_totale), fn () => round((float) $this->energie_totale, 2)),
        ];
    }
}
