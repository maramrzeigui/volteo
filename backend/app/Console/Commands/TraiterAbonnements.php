<?php

namespace App\Console\Commands;

use App\Services\Abonnements;
use Illuminate\Console\Command;

/** Renouvelle ou expire les abonnements arrivés à échéance (quotidien). */
class TraiterAbonnements extends Command
{
    protected $signature = 'abonnements:traiter-echeances';

    protected $description = 'Renouvelle ou expire les abonnements échus';

    public function handle(Abonnements $abonnements): int
    {
        $bilan = $abonnements->traiterEcheances();
        $this->info("{$bilan['renouveles']} renouvelé(s), {$bilan['expires']} expiré(s).");

        return self::SUCCESS;
    }
}
