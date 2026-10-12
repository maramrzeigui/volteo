<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminBadgeResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'uid' => $this->uid,
            'libelle' => $this->libelle,
            'userId' => $this->user_id,
            'userNom' => Concerns::nomComplet($this->user),
            'actif' => $this->actif,
            'bloque' => $this->bloque,
            'motifBlocage' => $this->motif_blocage,
            'dateExpiration' => $this->date_expiration?->format('Y-m-d'),
            'statut' => $this->statut(),
            'derniereUtilisation' => $this->derniere_utilisation?->toIso8601String(),
            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
