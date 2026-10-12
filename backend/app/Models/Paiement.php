<?php

namespace App\Models;

use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id', 'session_recharge_id', 'souscription_id', 'montant', 'montant_rembourse', 'methode', 'statut',
    'reference_psp', 'motif_remboursement', 'rembourse_le', 'regle_le',
])]
class Paiement extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->whereIn($q->qualifyColumn('session_recharge_id'), static::sessionsDe($station));
    }

    protected $attributes = ['statut' => 'paye', 'montant_rembourse' => 0];

    protected function casts(): array
    {
        return [
            'montant' => 'float',
            'montant_rembourse' => 'float',
            'rembourse_le' => 'datetime',
            'regle_le' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(SessionRecharge::class, 'session_recharge_id');
    }

    public function souscription(): BelongsTo
    {
        return $this->belongsTo(Souscription::class);
    }
}
