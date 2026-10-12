<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Société cliente de la plateforme : exploite ses propres bornes de recharge. */
#[Fillable([
    'nom', 'raison_sociale', 'matricule_fiscal', 'email', 'telephone', 'adresse', 'ville',
    'commission_pct', 'formule', 'bornes_max', 'statut', 'motif_suspension', 'debut_contrat', 'fin_contrat', 'rib', 'couleur',
])]
class Station extends Model
{
    public const FORMULES = ['essentiel', 'pro', 'entreprise'];

    protected $attributes = ['statut' => 'actif', 'formule' => 'pro', 'commission_pct' => 10];

    protected function casts(): array
    {
        return [
            'commission_pct' => 'decimal:2',
            'debut_contrat' => 'date',
            'fin_contrat' => 'date',
        ];
    }

    public function bornes(): HasMany
    {
        return $this->hasMany(Borne::class);
    }

    public function personnel(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function reversements(): HasMany
    {
        return $this->hasMany(Reversement::class);
    }

    public function estActive(): bool
    {
        return $this->statut === 'actif' && (! $this->fin_contrat || $this->fin_contrat->endOfDay()->isFuture());
    }
}
