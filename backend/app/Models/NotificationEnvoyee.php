<?php

namespace App\Models;

use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Trace de chaque notification d'alerte émise (email, SMS, push). */
#[Fillable(['alerte_id', 'canal', 'destinataire', 'sujet', 'contenu', 'statut', 'erreur'])]
class NotificationEnvoyee extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->whereIn($q->qualifyColumn('alerte_id'), fn ($s) => $s->select('id')->from('alertes')->whereIn('borne_id', static::bornesDe($station)));
    }

    protected $table = 'notifications_envoyees';

    public function alerte(): BelongsTo
    {
        return $this->belongsTo(Alerte::class);
    }
}
