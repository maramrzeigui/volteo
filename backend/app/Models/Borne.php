<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

#[Fillable([
    'source', 'source_id', 'operateur', 'nom', 'reference', 'numero_serie', 'modele', 'fabricant', 'adresse',
    'latitude', 'longitude', 'version_firmware', 'version_ocpp',
    'puissance_kw', 'etat', 'dernier_heartbeat', 'deconnectee_le', 'temperature_c', 'tarif_kwh',
    'tarif_id', 'tarif_special_id', 'exploitant_id', 'technicien_id', 'site', 'station_id',
])]
#[Hidden(['ocpp_mot_de_passe'])]
class Borne extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->where($q->qualifyColumn('station_id'), $station);
    }

    use Auditable;

    public const ETATS = ['disponible', 'occupee', 'indisponible', 'hors_service', 'maintenance', 'deconnectee', 'defaut'];

    /** Au-delà, une borne sans heartbeat est considérée hors ligne. */
    public const DELAI_HEARTBEAT_MINUTES = 5;

    /** États dans lesquels aucune recharge ne peut démarrer. */
    public const ETATS_INDISPONIBLES = ['indisponible', 'hors_service', 'maintenance', 'deconnectee', 'defaut'];

    /** États fixés par l'exploitant : les messages OCPP ne les écrasent pas. */
    public const ETATS_MANUELS = ['hors_service', 'maintenance'];

    protected function casts(): array
    {
        return [
            'latitude' => 'float',
            'longitude' => 'float',
            'puissance_kw' => 'integer',
            'dernier_heartbeat' => 'datetime',
            'deconnectee_le' => 'datetime',
            'ocpp_mot_de_passe' => 'hashed',
            'temperature_c' => 'float',
            'tarif_kwh' => 'float',
        ];
    }

    public function estEnLigne(): bool
    {
        return $this->dernier_heartbeat !== null
            && $this->dernier_heartbeat->gt(now()->subMinutes(self::DELAI_HEARTBEAT_MINUTES))
            && $this->etat !== 'deconnectee';
    }

    /**
     * État calculé à partir des connecteurs (StatusNotification OCPP) : une prise
     * occupée rend la borne occupée, une prise libre la rend disponible ; toutes
     * en défaut → défaut ; sinon indisponible. Les états manuels sont conservés.
     */
    public function etatCalcule(): string
    {
        if (in_array($this->etat, self::ETATS_MANUELS, true)) {
            return $this->etat;
        }

        $etats = $this->connecteurs()->pluck('etat');

        return match (true) {
            $etats->contains('occupe') => 'occupee',
            $etats->contains('disponible') || $etats->contains('reserve') => 'disponible',
            $etats->isNotEmpty() && $etats->every(fn ($e) => $e === 'defaut') => 'defaut',
            $etats->isEmpty() => 'disponible',
            default => 'indisponible',
        };
    }

    public function accepteRecharge(): bool
    {
        // Une station suspendue (contrat impayé, fin de contrat) ne vend plus de recharges.
        if ($this->station_id && ! ($this->station?->estActive() ?? true)) {
            return false;
        }

        return ! in_array($this->etat, self::ETATS_INDISPONIBLES, true);
    }

    /** Bornes visibles des conducteurs : celles des stations actives (et les bornes publiques). */
    public function scopeOuvertesAuPublic(Builder $q): void
    {
        $q->where(fn ($w) => $w->whereNull($q->qualifyColumn('station_id'))
            ->orWhereIn($q->qualifyColumn('station_id'), fn ($s) => $s->select('id')->from('stations')->where('statut', 'actif')
                ->where(fn ($f) => $f->whereNull('fin_contrat')->orWhere('fin_contrat', '>=', now()->toDateString()))));
    }

    /** Vérifie le mot de passe OCPP (Security Profile 1) présenté par la borne. */
    public function verifierMotDePasseOcpp(?string $motDePasse): bool
    {
        return $this->ocpp_mot_de_passe !== null
            && $motDePasse !== null
            && Hash::check($motDePasse, $this->ocpp_mot_de_passe);
    }

    /** Mot de passe OCPP robuste (40 caractères, sans « : » interdit en HTTP Basic). */
    public static function genererMotDePasseOcpp(): string
    {
        return Str::password(40, symbols: false);
    }

    public function connecteurs(): HasMany
    {
        return $this->hasMany(Connecteur::class);
    }

    public function alertes(): HasMany
    {
        return $this->hasMany(Alerte::class);
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(SessionRecharge::class);
    }

    public function maintenances(): HasMany
    {
        return $this->hasMany(Maintenance::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    public function tarif(): BelongsTo
    {
        return $this->belongsTo(Tarif::class);
    }

    public function tarifSpecial(): BelongsTo
    {
        return $this->belongsTo(Tarif::class, 'tarif_special_id');
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }

    public function exploitant(): BelongsTo
    {
        return $this->belongsTo(User::class, 'exploitant_id');
    }

    public function technicien(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technicien_id');
    }
}
