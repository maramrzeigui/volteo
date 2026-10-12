<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['maintenance_id', 'designation', 'reference', 'quantite', 'cout_unitaire'])]
class MaintenancePiece extends Model
{
    protected function casts(): array
    {
        return ['quantite' => 'integer', 'cout_unitaire' => 'float'];
    }
}
