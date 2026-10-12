<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Message échangé entre la plateforme Volteo et une station. */
class MessageStation extends Model
{
    public const CATEGORIES = ['message', 'demande', 'annonce'];

    protected $table = 'messages_station';

    protected $fillable = ['station_id', 'auteur_id', 'de_plateforme', 'categorie', 'contenu', 'lu_at'];

    protected function casts(): array
    {
        return ['de_plateforme' => 'boolean', 'lu_at' => 'datetime'];
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }

    public function auteur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'auteur_id');
    }

    public function enTableau(): array
    {
        return [
            'id' => $this->id,
            'dePlateforme' => $this->de_plateforme,
            'categorie' => $this->categorie,
            'contenu' => $this->contenu,
            'auteur' => $this->auteur ? trim("{$this->auteur->prenom} {$this->auteur->nom}") : ($this->de_plateforme ? 'Volteo' : 'Station'),
            'lu' => $this->lu_at !== null,
            'date' => $this->created_at?->toIso8601String(),
        ];
    }
}
