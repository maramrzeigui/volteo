<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\DansLePerimetre;
use App\Support\Permissions;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'nom', 'prenom', 'email', 'telephone', 'role', 'station_id', 'actif', 'solde_wallet', 'password'])]
#[Hidden(['password', 'remember_token', 'two_factor_code', 'reset_code', 'google_id'])]
class User extends Authenticatable
{
    use DansLePerimetre;

    /** Périmètre du personnel d'une station (voir {@see DansLePerimetre}). */
    protected static function restreindre(Builder $q, int $station): void
    {
        $q->where(fn ($w) => $w->where($q->qualifyColumn('station_id'), $station)
            ->orWhereIn($q->qualifyColumn('id'), fn ($s) => $s->select('user_id')->from('sessions_recharge')->whereIn('borne_id', static::bornesDe($station))));
    }

    use Auditable;

    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $attributes = ['actif' => true, 'role' => 'client', 'solde_wallet' => 0];

    public const ROLES = ['super_admin', 'exploitant', 'operateur', 'technicien', 'service_client', 'finance', 'client', 'fabricant'];

    public const ROLES_PERSONNEL = ['super_admin', 'exploitant', 'operateur', 'technicien', 'service_client', 'finance'];

    protected static function booted(): void
    {
        // Jeton unique encodé dans le QR code d'identification du client (module 6).
        static::creating(function (User $user) {
            $user->qr_token ??= Str::random(40);
        });
    }

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'solde_wallet' => 'decimal:2',
            'actif' => 'boolean',
            'derniere_connexion' => 'datetime',
            'two_factor_enabled' => 'boolean',
            'two_factor_expires_at' => 'datetime',
            'reset_code_expires_at' => 'datetime',
        ];
    }

    public function station(): BelongsTo
    {
        return $this->belongsTo(Station::class);
    }

    /** Super-admin ou personnel plateforme : voit toutes les stations. */
    public function estPlateforme(): bool
    {
        return $this->role === 'super_admin' || ($this->estPersonnel() && ! $this->station_id);
    }

    public function estPersonnel(): bool
    {
        return in_array($this->role, self::ROLES_PERSONNEL, true);
    }

    /** Niveau d'accès du rôle sur un module : aucun, lecture ou ecriture (§7). */
    public function niveau(string $module): string
    {
        $niveau = Permissions::niveau($this->role, $module);
        if ($this->station_id && $this->role !== 'super_admin') {
            // Personnel d'une station : les mêmes écrans que la plateforme, limités à ses données.
            $plafond = self::ACCES_STATION[$module] ?? 'aucun';
            $rang = ['aucun' => 0, 'lecture' => 1, 'ecriture' => 2];
            return $rang[$niveau] <= $rang[$plafond] ? $niveau : $plafond;
        }
        return $niveau;
    }

    /**
     * Accès maximum du personnel d'une station (toujours restreint à sa station par le périmètre).
     * Les paramètres de la plateforme restent modifiables par le super-admin seulement.
     */
    public const ACCES_STATION = [
        'dashboard' => 'lecture', 'supervision' => 'ecriture', 'bornes' => 'ecriture', 'sessions' => 'ecriture',
        'utilisateurs' => 'ecriture', 'rfid' => 'ecriture', 'vehicules' => 'ecriture', 'paiements' => 'ecriture',
        'tarification' => 'ecriture', 'maintenance' => 'ecriture', 'alertes' => 'ecriture', 'firmware' => 'ecriture',
        'rapports' => 'lecture', 'documents' => 'ecriture', 'audit' => 'lecture', 'parametres' => 'lecture',
    ];

    public function peut(string $module, string $niveau = 'lecture'): bool
    {
        $rang = ['aucun' => 0, 'lecture' => 1, 'ecriture' => 2];
        return $rang[$this->niveau($module)] >= $rang[$niveau];
    }

    /** Abonnement en cours de validité, s'il existe. */
    /** Solde minimum pour démarrer (1 DT par défaut) : la recharge s'arrête ensuite d'elle-même au solde exact. */
    public static function soldeMinimumRecharge(): float
    {
        return (float) Parametre::get('solde_minimum_recharge', 1);
    }

    /**
     * Raison pour laquelle ce client ne peut pas démarrer de recharge (null s'il le peut) :
     * une recharge précédente impayée, ou un wallet sous le solde minimum.
     */
    public function motifRefusRecharge(): ?string
    {
        $impaye = (float) $this->paiements()->where('statut', 'en_attente')->sum('montant');
        if ($impaye > 0) {
            return 'Vous avez '.number_format($impaye, 2, ',', ' ').' DT de recharge impayée. Réglez-la avant de lancer une nouvelle recharge.';
        }
        $minimum = self::soldeMinimumRecharge();
        if ((float) $this->solde_wallet < $minimum) {
            return 'Solde insuffisant : il faut au moins '.number_format($minimum, 2, ',', ' ').' DT dans votre wallet pour démarrer une recharge (solde actuel : '
                .number_format((float) $this->solde_wallet, 2, ',', ' ').' DT). Rechargez votre wallet par carte bancaire, Flouci ou e-DINAR.';
        }

        return null;
    }

    public function souscriptionActive(): ?Souscription
    {
        return $this->souscriptions()
            ->with('abonnement')
            ->where('statut', 'active')
            ->whereDate('date_debut', '<=', today())
            ->whereDate('date_fin', '>=', today())
            ->latest('date_debut')
            ->first();
    }

    public function vehicules(): HasMany
    {
        return $this->hasMany(Vehicule::class);
    }

    public function badges(): HasMany
    {
        return $this->hasMany(BadgeRfid::class);
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(SessionRecharge::class);
    }

    public function factures(): HasMany
    {
        return $this->hasMany(Facture::class);
    }

    public function paiements(): HasMany
    {
        return $this->hasMany(Paiement::class);
    }

    public function souscriptions(): HasMany
    {
        return $this->hasMany(Souscription::class);
    }
}
