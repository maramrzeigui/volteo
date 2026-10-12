<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DocumentResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'borneId' => $this->borne_id,
            'borneNom' => $this->borne?->nom,
            'maintenanceId' => $this->maintenance_id,
            'type' => $this->type,
            'titre' => $this->titre,
            'nomFichier' => $this->nom_fichier,
            'mime' => $this->mime,
            'taille' => $this->taille,
            'dateExpiration' => $this->date_expiration?->format('Y-m-d'),
            'auteur' => Concerns::nomComplet($this->auteur),
            'createdAt' => $this->created_at->toIso8601String(),
        ];
    }
}
