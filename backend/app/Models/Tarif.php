<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Module 10 — un tarif par kWh, minute, heure ou puissance, avec heures creuses optionnelles. */
#[Fillable([
    'station_id', 'nom', 'mode', 'prix', 'prix_heures_creuses', 'heures_creuses_debut', 'heures_creuses_fin',
    'frais_session', 'special', 'valide_du', 'valide_au', 'actif', 'description',
])]
class Tarif extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->where(fn ($w) => $w->where($q->qualifyColumn('station_id'), $station)->orWhereNull($q->qualifyColumn('station_id')));
    }

    use Auditable;

    protected $attributes = ['actif' => true, 'special' => false, 'frais_session' => 0];

    public const MODES = ['kwh', 'minute', 'heure', 'puissance'];

    protected function casts(): array
    {
        return [
            'prix' => 'float',
            'prix_heures_creuses' => 'float',
            'frais_session' => 'float',
            'special' => 'boolean',
            'actif' => 'boolean',
            'valide_du' => 'date:Y-m-d',
            'valide_au' => 'date:Y-m-d',
        ];
    }

    /** Le tarif s'applique-t-il à cette date (actif et dans sa période de validité) ? */
    public function estValide(\DateTimeInterface $date): bool
    {
        $jour = $date->format('Y-m-d');

        return $this->actif
            && (! $this->valide_du || $this->valide_du->format('Y-m-d') <= $jour)
            && (! $this->valide_au || $this->valide_au->format('Y-m-d') >= $jour);
    }

    public function bornes(): HasMany
    {
        return $this->hasMany(Borne::class);
    }
}
