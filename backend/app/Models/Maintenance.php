<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Ordre de travail de maintenance (module 11). */
#[Fillable([
    'reference', 'borne_id', 'panne_id', 'technicien_id', 'type', 'priorite', 'titre', 'statut',
    'description', 'date_prevue', 'date_debut', 'date_fin', 'rapport', 'periodicite_jours',
])]
class Maintenance extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->whereIn($q->qualifyColumn('borne_id'), static::bornesDe($station));
    }

    use Auditable;

    protected $attributes = ['statut' => 'planifiee', 'type' => 'corrective', 'priorite' => 'normale'];

    protected static function booted(): void
    {
        static::created(function (Maintenance $m) {
            if (! $m->reference) {
                $m->updateQuietly(['reference' => sprintf('OT-%s-%04d', now()->format('Y'), $m->id)]);
            }
        });
    }

    protected function casts(): array
    {
        return [
            'date_prevue' => 'date:Y-m-d',
            'date_debut' => 'datetime',
            'date_fin' => 'datetime',
            'periodicite_jours' => 'integer',
        ];
    }

    public function datePrevueAujourdhui(): bool
    {
        return $this->date_prevue !== null && $this->date_prevue->lte(today());
    }

    public function borne(): BelongsTo
    {
        return $this->belongsTo(Borne::class);
    }

    public function panne(): BelongsTo
    {
        return $this->belongsTo(Panne::class);
    }

    public function technicien(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technicien_id');
    }

    public function pieces(): HasMany
    {
        return $this->hasMany(MaintenancePiece::class);
    }

    public function interventions(): HasMany
    {
        return $this->hasMany(MaintenanceIntervention::class)->orderBy('debut');
    }

    public function commentaires(): HasMany
    {
        return $this->hasMany(MaintenanceCommentaire::class)->orderBy('created_at');
    }

    public function photos(): HasMany
    {
        return $this->hasMany(Document::class)->where('type', 'photo');
    }
}
