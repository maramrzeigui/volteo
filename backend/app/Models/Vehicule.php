<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'marque', 'modele', 'immatriculation', 'type_connecteur', 'capacite_batterie_kwh'])]
class Vehicule extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->whereIn($q->qualifyColumn('user_id'), fn ($s) => $s->select('user_id')->from('sessions_recharge')->whereIn('borne_id', static::bornesDe($station)));
    }

    use Auditable;

    protected function casts(): array
    {
        return ['capacite_batterie_kwh' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(SessionRecharge::class);
    }
}
