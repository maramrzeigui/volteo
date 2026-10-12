<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Relevé mensuel payé à une station : chiffre d'affaires, commission de la plateforme, net reversé. */
#[Fillable(['station_id', 'periode', 'chiffre_affaires', 'commission', 'net', 'sessions', 'energie_kwh', 'statut', 'reference', 'paye_le', 'paye_par'])]
class Reversement extends Model
{
    protected function casts(): array
    {
        return [
            'chiffre_affaires' => 'decimal:3',
            'commission' => 'decimal:3',
            'net' => 'decimal:3',
            'energie_kwh' => 'decimal:3',
            'paye_le' => 'datetime',
        ];
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }
}
