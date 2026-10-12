<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Module 17 — paramètres système en clé/valeur (valeurs JSON).
 * Les valeurs par défaut viennent de config/plateforme.php.
 */
#[Fillable(['cle', 'valeur'])]
class Parametre extends Model
{
    protected $primaryKey = 'cle';

    public $incrementing = false;

    protected $keyType = 'string';

    private const CACHE = 'parametres.tous';

    /** @return array<string, mixed> */
    public static function tous(): array
    {
        $enBase = Cache::rememberForever(self::CACHE, fn () => static::all()
            ->mapWithKeys(fn (Parametre $p) => [$p->cle => json_decode($p->valeur ?? 'null', true)])
            ->all());

        return array_replace(config('plateforme.parametres'), $enBase);
    }

    public static function get(string $cle, mixed $defaut = null): mixed
    {
        return static::tous()[$cle] ?? $defaut;
    }

    /** @param array<string, mixed> $valeurs */
    public static function enregistrer(array $valeurs): void
    {
        foreach ($valeurs as $cle => $valeur) {
            static::updateOrCreate(['cle' => $cle], ['valeur' => json_encode($valeur)]);
        }
        Cache::forget(self::CACHE);
    }
}
