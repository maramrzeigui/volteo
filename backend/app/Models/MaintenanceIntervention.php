<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['maintenance_id', 'technicien_id', 'debut', 'fin', 'description'])]
class MaintenanceIntervention extends Model
{
    protected function casts(): array
    {
        return ['debut' => 'datetime', 'fin' => 'datetime'];
    }

    public function technicien(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technicien_id');
    }
}
