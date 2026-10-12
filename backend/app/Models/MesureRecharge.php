<?php

namespace App\Models;

use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['session_recharge_id', 'horodatage', 'energie_kwh', 'puissance_kw', 'pourcentage_batterie'])]
class MesureRecharge extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->whereIn($q->qualifyColumn('session_recharge_id'), static::sessionsDe($station));
    }

    protected $table = 'mesures_recharge';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'horodatage' => 'datetime',
            'energie_kwh' => 'float',
            'puissance_kw' => 'float',
            'pourcentage_batterie' => 'integer',
        ];
    }
}
