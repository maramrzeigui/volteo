<?php

namespace App\Support;

use App\Models\PermissionRole;
use Illuminate\Support\Facades\Cache;

/**
 * Matrice des permissions (§7) : niveau aucun / lecture / ecriture par rôle et
 * par module. Valeurs par défaut dans config/plateforme.php, surchargées par
 * la table permissions_roles (éditable par le super administrateur).
 */
class Permissions
{
    public const NIVEAUX = ['aucun', 'lecture', 'ecriture'];

    private const CACHE = 'permissions.matrice';

    /** @return array<string, array<string, string>> rôle → module → niveau */
    public static function matrice(): array
    {
        $surcharges = Cache::rememberForever(self::CACHE, fn () => PermissionRole::all()
            ->groupBy('role')
            ->map(fn ($lignes) => $lignes->pluck('niveau', 'module')->all())
            ->all());

        $matrice = [];
        foreach (config('plateforme.permissions') as $role => $modules) {
            $matrice[$role] = array_replace($modules, $surcharges[$role] ?? []);
        }

        return $matrice;
    }

    public static function niveau(string $role, string $module): string
    {
        // Le super administrateur garde toujours la main (évite de se verrouiller hors de la plateforme).
        if ($role === 'super_admin') {
            return 'ecriture';
        }

        return self::matrice()[$role][$module] ?? 'aucun';
    }

    public static function autorise(string $role, string $module, string $niveauRequis): bool
    {
        $rang = array_flip(self::NIVEAUX);

        return $rang[self::niveau($role, $module)] >= $rang[$niveauRequis];
    }

    /** @param array<string, array<string, string>> $matrice */
    public static function enregistrer(array $matrice): void
    {
        foreach ($matrice as $role => $modules) {
            if ($role === 'super_admin') {
                continue;
            }
            foreach ($modules as $module => $niveau) {
                PermissionRole::updateOrCreate(['role' => $role, 'module' => $module], ['niveau' => $niveau]);
            }
        }
        Cache::forget(self::CACHE);
    }
}
