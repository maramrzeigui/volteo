<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'abonnement_id', 'date_debut', 'date_fin', 'statut', 'renouvellement_auto'])]
class Souscription extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->whereIn($q->qualifyColumn('user_id'), fn ($s) => $s->select('user_id')->from('sessions_recharge')->whereIn('borne_id', static::bornesDe($station)));
    }

    use Auditable;

    protected $attributes = ['statut' => 'active', 'renouvellement_auto' => true];

    protected function casts(): array
    {
        return [
            'date_debut' => 'date:Y-m-d',
            'date_fin' => 'date:Y-m-d',
            'renouvellement_auto' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function abonnement(): BelongsTo
    {
        return $this->belongsTo(Abonnement::class);
    }
}
