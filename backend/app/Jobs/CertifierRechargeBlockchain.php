<?php

namespace App\Jobs;

use App\Models\SessionRecharge;
use App\Services\CertificationRecharges;
use Illuminate\Foundation\Bus\Dispatchable;

/** Certification blockchain d'une recharge, lancée juste après la réponse HTTP de fin de recharge. */
class CertifierRechargeBlockchain
{
    use Dispatchable;

    public function __construct(public int $sessionId) {}

    public function handle(CertificationRecharges $certification): void
    {
        if ($session = SessionRecharge::withoutGlobalScopes()->find($this->sessionId)) {
            $certification->certifier($session);
        }
    }
}
