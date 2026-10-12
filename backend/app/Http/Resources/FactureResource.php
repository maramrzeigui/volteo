<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Sortie alignée sur le type `Facture` de l'app mobile (champs back-office ajoutés). */
class FactureResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sessionId' => $this->session_recharge_id,
            'numero' => $this->numero,
            'date' => $this->date->format('Y-m-d'),
            'montantHt' => $this->montant_ht,
            'tauxTva' => $this->taux_tva,
            'montantTva' => $this->montant_tva,
            'montantTtc' => $this->montant_ttc,
            'statut' => $this->statut,
            'urlPdf' => $this->chemin_pdf,
            'userId' => $this->user_id,
            'userNom' => $this->whenLoaded('user', fn () => Concerns::nomComplet($this->user)),
        ];
    }
}
