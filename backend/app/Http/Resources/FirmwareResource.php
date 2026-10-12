<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FirmwareResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'version' => $this->version,
            'fabricant' => $this->fabricant,
            'modele' => $this->modele,
            'nomFichier' => $this->nom_fichier,
            'taille' => $this->taille,
            'checksum' => $this->checksum_sha256,
            'notes' => $this->notes,
            'auteur' => Concerns::nomComplet($this->auteur),
            'nbDeploiements' => $this->whenCounted('deploiements'),
            'createdAt' => $this->created_at->toIso8601String(),
        ];
    }
}
