<?php

namespace App\Models;

use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'action', 'cible', 'details', 'ip'])]
class AuditLog extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->whereIn($q->qualifyColumn('user_id'), fn ($s) => $s->select('id')->from('users')->where('station_id', $station));
    }

    /** Journalise une action (module 18 — traçabilité complète). */
    public static function record(?int $userId, string $action, ?string $cible = null, ?string $details = null): void
    {
        static::create([
            'user_id' => $userId,
            'action' => $action,
            'cible' => $cible,
            'details' => $details,
            'ip' => request()->ip(),
        ]);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
