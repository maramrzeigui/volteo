<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PaiementResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'userId' => $this->user_id,
            'userNom' => $this->whenLoaded('user', fn () => Concerns::nomComplet($this->user)),
            'sessionId' => $this->session_recharge_id,
            'souscriptionId' => $this->souscription_id,
            'objet' => match (true) {
                (bool) $this->session_recharge_id => 'Recharge #'.$this->session_recharge_id,
                (bool) $this->souscription_id => 'Abonnement',
                $this->methode === 'topup_carte' => 'Rechargement wallet',
                $this->methode === 'ajustement' => 'Ajustement wallet',
                default => 'Paiement',
            },
            'montant' => $this->montant,
            'montantRembourse' => $this->montant_rembourse,
            'methode' => $this->methode,
            'statut' => $this->statut,
            'referencePsp' => $this->reference_psp,
            'motifRemboursement' => $this->motif_remboursement,
            'rembourseLe' => $this->rembourse_le?->toIso8601String(),
            'regleLe' => $this->regle_le?->toIso8601String(),
            'date' => $this->created_at->toIso8601String(),
        ];
    }
}
