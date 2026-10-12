<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Formule d'abonnement : prix mensuel, remise sur les recharges et kWh inclus. */
#[Fillable(['nom', 'description', 'prix_mensuel', 'remise_pourcent', 'kwh_inclus', 'actif'])]
class Abonnement extends Model
{
    use Auditable;

    protected $attributes = ['actif' => true, 'remise_pourcent' => 0, 'kwh_inclus' => 0];

    protected function casts(): array
    {
        return [
            'prix_mensuel' => 'float',
            'remise_pourcent' => 'integer',
            'kwh_inclus' => 'integer',
            'actif' => 'boolean',
        ];
    }

    public function souscriptions(): HasMany
    {
        return $this->hasMany(Souscription::class);
    }
}
