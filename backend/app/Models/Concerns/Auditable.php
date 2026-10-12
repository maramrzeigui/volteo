<?php

namespace App\Models\Concerns;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

/**
 * Module 18 — traçabilité complète : toute création, modification ou
 * suppression faite par un utilisateur connecté est journalisée avec le
 * détail des champs modifiés (avant → après).
 */
trait Auditable
{
    /** Champs jamais journalisés (techniques ou sensibles). */
    private static array $champsIgnores = [
        'created_at', 'updated_at', 'password', 'remember_token', 'two_factor_code', 'two_factor_expires_at',
        'reset_code', 'reset_code_expires_at', 'dernier_heartbeat', 'temperature_c', 'derniere_connexion', 'qr_token',
        'ocpp_mot_de_passe', 'deconnectee_le',
    ];

    public static function bootAuditable(): void
    {
        static::created(fn (Model $m) => $m->journaliserAudit('creation', $m->libelleAudit()));

        static::updated(function (Model $m) {
            $changements = [];
            foreach ($m->getChanges() as $champ => $valeur) {
                if (! in_array($champ, self::$champsIgnores, true)) {
                    $changements[$champ] = [$m->getOriginal($champ), $valeur];
                }
            }
            if ($changements) {
                $m->journaliserAudit('modification', json_encode($changements, JSON_UNESCAPED_UNICODE));
            }
        });

        static::deleted(fn (Model $m) => $m->journaliserAudit('suppression', $m->libelleAudit()));
    }

    protected function journaliserAudit(string $action, ?string $details): void
    {
        // Les mises à jour système (OCPP, tâches planifiées) ne sont pas des actions utilisateur.
        if (! auth()->check() || app()->runningInConsole() && ! app()->runningUnitTests()) {
            return;
        }

        AuditLog::record(auth()->id(), $action, $this->cibleAudit().':'.$this->getKey(), $details);
    }

    protected function cibleAudit(): string
    {
        return str(class_basename($this))->snake()->toString();
    }

    protected function libelleAudit(): ?string
    {
        return $this->nom ?? $this->titre ?? $this->reference ?? $this->uid ?? $this->version ?? $this->immatriculation ?? null;
    }
}
