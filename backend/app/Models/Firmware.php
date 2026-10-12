<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['version', 'fabricant', 'modele', 'fichier', 'nom_fichier', 'taille', 'checksum_sha256', 'notes', 'televerse_par'])]
class Firmware extends Model
{
    use Auditable;

    protected $table = 'firmwares';

    protected function casts(): array
    {
        return ['taille' => 'integer'];
    }

    public function deploiements(): HasMany
    {
        return $this->hasMany(DeploiementFirmware::class);
    }

    public function auteur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'televerse_par');
    }
}
