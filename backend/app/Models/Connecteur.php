<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['borne_id', 'type', 'puissance_kw', 'etat'])]
class Connecteur extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->whereIn($q->qualifyColumn('borne_id'), static::bornesDe($station));
    }

    use Auditable;

    protected $attributes = ['etat' => 'disponible'];

    protected $table = 'connecteurs';

    public const TYPES = ['CCS', 'Type2', 'CHAdeMO', 'AC', 'DC'];

    public const ETATS = ['disponible', 'occupe', 'reserve', 'indisponible', 'defaut'];

    protected function casts(): array
    {
        return ['puissance_kw' => 'integer'];
    }

    /** Courant délivré : les prises CCS / CHAdeMO / DC sont en courant continu. */
    public function courant(): string
    {
        return in_array($this->type, ['CCS', 'CHAdeMO', 'DC'], true) ? 'DC' : 'AC';
    }

    public function borne(): BelongsTo
    {
        return $this->belongsTo(Borne::class);
    }
}
