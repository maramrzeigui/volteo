<?php

namespace App\Models;

use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['borne_id', 'type', 'gravite', 'message', 'resolue', 'resolue_le', 'resolue_par', 'prise_en_charge_par'])]
class Alerte extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->whereIn($q->qualifyColumn('borne_id'), static::bornesDe($station));
    }

    protected $attributes = ['resolue' => false, 'gravite' => 'warning'];

    public const TYPES = ['borne_deconnectee', 'defaut_materiel', 'surchauffe', 'coupure_electrique', 'porte_ouverte', 'erreur_ocpp'];

    protected function casts(): array
    {
        return ['resolue' => 'boolean', 'resolue_le' => 'datetime'];
    }

    /**
     * Crée l'alerte si aucune alerte du même type n'est déjà ouverte sur la borne.
     * Les notifications (email / SMS / push) partent via l'observateur AlerteObserver.
     */
    public static function lever(Borne $borne, string $type, string $gravite, string $message): ?self
    {
        if ($borne->alertes()->where('type', $type)->where('resolue', false)->exists()) {
            return null;
        }

        return static::create([
            'borne_id' => $borne->id,
            'type' => $type,
            'gravite' => $gravite,
            'message' => $message,
        ]);
    }

    public function borne(): BelongsTo
    {
        return $this->belongsTo(Borne::class);
    }

    public function resoluePar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolue_par');
    }

    public function priseEnChargePar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'prise_en_charge_par');
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(NotificationEnvoyee::class);
    }
}
