<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Module 16 — notices, photos, contrats, plans, garanties (et diagnostics OCPP). */
#[Fillable(['borne_id', 'maintenance_id', 'type', 'titre', 'fichier', 'nom_fichier', 'mime', 'taille', 'date_expiration', 'televerse_par'])]
class Document extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->whereIn($q->qualifyColumn('borne_id'), static::bornesDe($station));
    }

    use Auditable;

    public const TYPES = ['notice', 'photo', 'contrat', 'plan', 'garantie', 'diagnostic', 'autre'];

    protected function casts(): array
    {
        return ['taille' => 'integer', 'date_expiration' => 'date:Y-m-d'];
    }

    public function borne(): BelongsTo
    {
        return $this->belongsTo(Borne::class);
    }

    public function auteur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'televerse_par');
    }
}
