<?php

namespace App\Models;

use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable([
    'user_id', 'borne_id', 'connecteur_id', 'vehicule_id', 'tarif_id', 'badge_rfid_id', 'origine',
    'date_debut', 'date_fin', 'energie_kwh', 'index_debut_wh', 'prix', 'etat',
    'puissance_instantanee_kw', 'pourcentage_batterie', 'transaction_ocpp_id',
    'pause_le', 'pause_secondes', 'motif_annulation', 'arret_solde',
])]
class SessionRecharge extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->whereIn($q->qualifyColumn('borne_id'), static::bornesDe($station));
    }

    protected $table = 'sessions_recharge';

    protected $attributes = ['origine' => 'application', 'pause_secondes' => 0];

    public const ETATS_ACTIFS = ['en_cours', 'en_pause'];

    protected function casts(): array
    {
        return [
            'date_debut' => 'datetime',
            'date_fin' => 'datetime',
            'pause_le' => 'datetime',
            'pause_secondes' => 'integer',
            'energie_kwh' => 'float',
            'prix' => 'float',
            'puissance_instantanee_kw' => 'float',
            'pourcentage_batterie' => 'integer',
            'arret_solde' => 'boolean',
            'index_debut_wh' => 'integer',
        ];
    }

    public function estActive(): bool
    {
        return in_array($this->etat, self::ETATS_ACTIFS, true);
    }

    /** Durée de charge effective (pauses déduites), en secondes. */
    public function dureeEffectiveSecondes(): int
    {
        $fin = $this->date_fin ?? now();
        $pause = $this->pause_secondes + ($this->pause_le ? (int) $this->pause_le->diffInSeconds($fin) : 0);

        return max(0, (int) $this->date_debut->diffInSeconds($fin) - $pause);
    }

    /**
     * Temps restant estimé (minutes) pour atteindre 100 % : capacité batterie du
     * véhicule × pourcentage manquant / puissance instantanée.
     */
    public function tempsRestantMinutes(): ?int
    {
        $capacite = $this->vehicule?->capacite_batterie_kwh;
        if (! $this->estActive() || ! $capacite || ! $this->pourcentage_batterie || ! $this->puissance_instantanee_kw) {
            return null;
        }

        $kwhRestants = $capacite * (100 - $this->pourcentage_batterie) / 100;

        return (int) round($kwhRestants / $this->puissance_instantanee_kw * 60);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function borne(): BelongsTo
    {
        return $this->belongsTo(Borne::class);
    }

    public function connecteur(): BelongsTo
    {
        return $this->belongsTo(Connecteur::class);
    }

    public function vehicule(): BelongsTo
    {
        return $this->belongsTo(Vehicule::class);
    }

    public function tarif(): BelongsTo
    {
        return $this->belongsTo(Tarif::class);
    }

    public function badge(): BelongsTo
    {
        return $this->belongsTo(BadgeRfid::class, 'badge_rfid_id');
    }

    public function mesures(): HasMany
    {
        return $this->hasMany(MesureRecharge::class);
    }

    public function facture(): HasOne
    {
        return $this->hasOne(Facture::class);
    }

    public function paiement(): HasOne
    {
        return $this->hasOne(Paiement::class);
    }
}
