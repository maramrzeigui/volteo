<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Batterie */
class BatterieResource extends JsonResource
{
    private bool $avecCode = false;

    /** Le code d'activation n'est montré qu'au fabricant (étiquette / facture). */
    public function avecCode(): static
    {
        $this->avecCode = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'numSerie' => $this->num_serie,
            'modele' => $this->modele,
            'chimie' => $this->chimie,
            'capaciteKwh' => $this->capacite_kwh,
            'vin' => $this->vin,
            'statut' => $this->statut,
            'tokenId' => $this->token_id,
            'txCreation' => $this->tx_creation,
            'txTransfert' => $this->tx_transfert,
            'vehiculeId' => $this->vehicule_id,
            'proprietaire' => $this->whenLoaded('proprietaire', fn () => $this->proprietaire ? trim("{$this->proprietaire->prenom} {$this->proprietaire->nom}") : null),
            'activeeLe' => $this->activee_le?->toIso8601String(),
            'erreur' => $this->erreur,
            'creeeLe' => $this->created_at?->toIso8601String(),
            'codeActivation' => $this->when($this->avecCode, fn () => $this->code_activation),
        ];
    }
}
