<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['maintenance_id', 'user_id', 'contenu'])]
class MaintenanceCommentaire extends Model
{
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
