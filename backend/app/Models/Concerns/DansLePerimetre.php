<?php

namespace App\Models\Concerns;

use App\Support\Perimetre;
use Illuminate\Database\Eloquent\Builder;

/**
 * Restreint automatiquement les requêtes du modèle à la station de l'utilisateur
 * (périmètre actif). Chaque modèle décrit son lien à la station.
 */
trait DansLePerimetre
{
    public static function bootDansLePerimetre(): void
    {
        static::addGlobalScope('perimetre', function (Builder $q) {
            $perimetre = app(Perimetre::class);
            if ($perimetre->actif()) {
                static::restreindre($q, $perimetre->station());
            }
        });
    }

    /** Ids des bornes de la station (sous-requête). */
    protected static function bornesDe(int $station): \Closure
    {
        return fn ($s) => $s->select('id')->from('bornes')->where('station_id', $station);
    }

    /** Ids des sessions sur les bornes de la station (sous-requête). */
    protected static function sessionsDe(int $station): \Closure
    {
        return fn ($s) => $s->select('id')->from('sessions_recharge')->whereIn('borne_id', static::bornesDe($station));
    }

    abstract protected static function restreindre(Builder $q, int $station): void;
}
