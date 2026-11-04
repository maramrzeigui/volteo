<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Batterie de véhicule électrique tracée dans la blockchain : son NFT (BatteryPassport) est créé
 * par le fabricant, puis transféré au client qui l'active avec le code imprimé sur sa facture.
 */
#[Fillable([
    'fabricant_id', 'num_serie', 'modele', 'chimie', 'capacite_kwh', 'vin', 'statut', 'token_id',
    'tx_creation', 'code_activation', 'proprietaire_id', 'vehicule_id', 'tx_transfert', 'activee_le', 'erreur',
])]
#[Hidden(['code_activation'])]
class Batterie extends Model
{
    protected $table = 'batteries';

    protected function casts(): array
    {
        return [
            'capacite_kwh' => 'integer',
            'token_id' => 'integer',
            'code_activation' => 'encrypted',
            'activee_le' => 'datetime',
        ];
    }

    /** Code d'activation lisible (ex. K7M2-9QX4), sans caractères ambigus (0/O, 1/I). */
    public static function nouveauCode(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $code = '';
        for ($i = 0; $i < 8; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return substr($code, 0, 4).'-'.substr($code, 4);
    }

    public function codeValide(string $saisi): bool
    {
        $normaliser = fn (string $c) => Str::upper(preg_replace('/[^A-Za-z0-9]/', '', $c));

        return hash_equals($normaliser($this->code_activation), $normaliser($saisi));
    }

    public function fabricant(): BelongsTo
    {
        return $this->belongsTo(User::class, 'fabricant_id');
    }

    public function proprietaire(): BelongsTo
    {
        return $this->belongsTo(User::class, 'proprietaire_id');
    }

    public function vehicule(): BelongsTo
    {
        return $this->belongsTo(Vehicule::class);
    }

    /** Référence du portefeuille blockchain qui détient le NFT. */
    public function refDetenteur(): string
    {
        return $this->proprietaire_id ? 'user:'.$this->proprietaire_id : 'fabricant:'.$this->fabricant_id;
    }
}
