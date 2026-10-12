<?php

namespace App\Http\Resources;

use App\Models\User;

/** Petits utilitaires de présentation partagés par les ressources. */
final class Concerns
{
    public static function nomComplet(?User $user): ?string
    {
        return $user ? trim(($user->prenom ?? '').' '.($user->nom ?? '')) ?: $user->email : null;
    }
}
