<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DeploiementResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'firmwareId' => $this->firmware_id,
            'version' => $this->firmware?->version,
            'borneId' => $this->borne_id,
            'borneNom' => $this->borne?->nom,
            'versionPrecedente' => $this->version_precedente,
            'statut' => $this->statut,
            'rollback' => $this->rollback,
            'message' => $this->message,
            'lanceParNom' => Concerns::nomComplet($this->lanceur),
            'createdAt' => $this->created_at->toIso8601String(),
            'updatedAt' => $this->updated_at->toIso8601String(),
        ];
    }
}
