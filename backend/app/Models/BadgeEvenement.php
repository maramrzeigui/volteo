<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Historique d'un badge RFID (module 7). */
#[Fillable(['badge_rfid_id', 'acteur_id', 'borne_id', 'evenement', 'details'])]
class BadgeEvenement extends Model
{
    public function badge(): BelongsTo
    {
        return $this->belongsTo(BadgeRfid::class, 'badge_rfid_id');
    }

    public function acteur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acteur_id');
    }

    public function borne(): BelongsTo
    {
        return $this->belongsTo(Borne::class);
    }
}
