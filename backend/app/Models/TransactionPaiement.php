<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Tentative de paiement en ligne (carte bancaire, Flouci, e-DINAR) auprès d'une passerelle tunisienne. */
class TransactionPaiement extends Model
{
    public const OBJETS = ['recharge_wallet', 'reglement', 'abonnement'];

    protected $table = 'transactions_paiement';

    protected $attributes = ['statut' => 'en_cours', 'canal' => 'web'];

    protected $fillable = [
        'reference', 'user_id', 'objet', 'objet_id', 'montant', 'passerelle', 'moyen', 'statut',
        'reference_externe', 'url_paiement', 'canal', 'reponse', 'confirmee_le',
    ];

    protected function casts(): array
    {
        return ['montant' => 'float', 'reponse' => 'array', 'confirmee_le' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Montant en millimes (unité de toutes les passerelles tunisiennes). */
    public function millimes(): int
    {
        return (int) round($this->montant * 1000);
    }

    public function enTableau(): array
    {
        return [
            'reference' => $this->reference,
            'objet' => $this->objet,
            'montant' => $this->montant,
            'passerelle' => $this->passerelle,
            'moyen' => $this->moyen,
            'statut' => $this->statut,
            'url' => $this->statut === 'en_cours' ? $this->url_paiement : null,
            'date' => $this->created_at?->toIso8601String(),
        ];
    }
}
