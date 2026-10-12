<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminUserResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'nom' => $this->nom,
            'prenom' => $this->prenom,
            'email' => $this->email,
            'telephone' => $this->telephone,
            'role' => $this->role,
            'stationId' => $this->station_id,
            'stationNom' => $this->station?->nom,
            'actif' => $this->actif,
            'soldeWallet' => (float) $this->solde_wallet,
            'deuxFacteurs' => $this->two_factor_enabled,
            'qrToken' => $this->qr_token,
            'derniereConnexion' => $this->derniere_connexion?->toIso8601String(),
            'createdAt' => $this->created_at?->toIso8601String(),
            'nbSessions' => $this->whenCounted('sessions'),
            'nbVehicules' => $this->whenCounted('vehicules'),
            'nbBadges' => $this->whenCounted('badges'),
        ];
    }
}
