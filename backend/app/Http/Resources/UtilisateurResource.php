<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Sortie alignée sur le type `Utilisateur` de l'app mobile (+ permissions pour le web). */
class UtilisateurResource extends JsonResource
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
            'photoUrl' => $this->photo_url,
            'compteGoogle' => $this->google_id !== null,
            'role' => $this->role,
            'soldeWallet' => (float) $this->solde_wallet,
            'deuxFacteurs' => (bool) $this->two_factor_enabled,
            'qrToken' => $this->qr_token,
            // Back-office : station de rattachement (null pour la plateforme et les clients).
            'station' => $this->station_id ? ['id' => $this->station_id, 'nom' => $this->station?->nom, 'statut' => $this->station?->statut] : null,
            'plateforme' => $this->estPlateforme(),
            'permissions' => collect(config('plateforme.modules'))
                ->mapWithKeys(fn ($_, $module) => [$module => $this->niveau($module)]),
        ];
    }
}
