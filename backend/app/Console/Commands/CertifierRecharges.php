<?php

namespace App\Console\Commands;

use App\Models\Batterie;
use App\Models\SessionRecharge;
use App\Services\CertificationRecharges;
use Illuminate\Console\Command;

/** Certifie (ou recertifie après une panne du pont) les recharges des véhicules à batterie certifiée. */
class CertifierRecharges extends Command
{
    protected $signature = 'blockchain:certifier';

    protected $description = 'Inscrit dans la blockchain les recharges terminées non encore certifiées';

    public function handle(CertificationRecharges $certification): int
    {
        $vehicules = Batterie::where('statut', 'activee')->whereNotNull('vehicule_id')->pluck('vehicule_id');
        $sessions = SessionRecharge::withoutGlobalScopes()
            ->whereIn('vehicule_id', $vehicules)
            ->where('etat', 'terminee')
            ->where(fn ($q) => $q->whereNull('blockchain_statut')->orWhere('blockchain_statut', 'echec'))
            ->orderBy('id')
            ->get();

        foreach ($sessions as $session) {
            $certification->certifier($session);
            $this->line("Recharge #{$session->id} : ".($session->fresh()->blockchain_statut ?? 'ignorée'));
        }
        $this->info($sessions->count().' recharge(s) traitée(s).');

        return self::SUCCESS;
    }
}
