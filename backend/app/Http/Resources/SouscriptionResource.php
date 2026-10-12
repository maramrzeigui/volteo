<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SouscriptionResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'userId' => $this->user_id,
            'userNom' => $this->whenLoaded('user', fn () => Concerns::nomComplet($this->user)),
            'abonnementId' => $this->abonnement_id,
            'abonnementNom' => $this->abonnement?->nom,
            'remisePourcent' => $this->abonnement?->remise_pourcent,
            'kwhInclus' => $this->abonnement?->kwh_inclus,
            'prixMensuel' => $this->abonnement?->prix_mensuel,
            'dateDebut' => $this->date_debut->format('Y-m-d'),
            'dateFin' => $this->date_fin->format('Y-m-d'),
            'statut' => $this->statut,
            'renouvellementAuto' => $this->renouvellement_auto,
        ];
    }
}
