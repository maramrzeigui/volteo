<?php

namespace App\Models;

use App\Models\Concerns\DansLePerimetre;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'session_recharge_id', 'user_id', 'numero', 'date', 'montant_ht', 'taux_tva', 'montant_tva',
    'montant_ttc', 'statut', 'chemin_pdf',
])]
class Facture extends Model
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->whereIn($q->qualifyColumn('session_recharge_id'), static::sessionsDe($station));
    }

    protected $attributes = ['statut' => 'emise'];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'montant_ht' => 'float',
            'taux_tva' => 'float',
            'montant_tva' => 'float',
            'montant_ttc' => 'float',
        ];
    }

    /**
     * Émet la facture d'une session terminée, TVA ventilée depuis le TTC
     * avec le taux paramétré (module 17).
     */
    public static function emettre(SessionRecharge $session): self
    {
        $taux = (float) Parametre::get('tva_taux', 19);
        $ht = round($session->prix / (1 + $taux / 100), 2);

        return static::create([
            'session_recharge_id' => $session->id,
            'user_id' => $session->user_id,
            'numero' => sprintf('FAC-%s-%04d', $session->date_debut->format('Y'), $session->id),
            'date' => now()->toDateString(),
            'montant_ht' => $ht,
            'taux_tva' => $taux,
            'montant_tva' => round($session->prix - $ht, 2),
            'montant_ttc' => $session->prix,
        ]);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(SessionRecharge::class, 'session_recharge_id');
    }
}
