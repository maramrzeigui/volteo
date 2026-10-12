<?php

namespace App\Console\Commands;

use App\Models\Document;
use App\Models\Maintenance;
use App\Models\Parametre;
use App\Services\Notifications;
use Illuminate\Console\Command;

/**
 * Rappels quotidiens : maintenances préventives du jour (au technicien
 * affecté) et contrats / garanties qui expirent dans 30 jours.
 */
class RappelsMaintenance extends Command
{
    protected $signature = 'maintenances:rappels';

    protected $description = 'Envoie les rappels de maintenance et d\'échéance des documents';

    public function handle(Notifications $notifications): int
    {
        $ordres = Maintenance::with(['borne', 'technicien'])
            ->where('statut', 'planifiee')
            ->whereDate('date_prevue', today())
            ->get();

        foreach ($ordres as $m) {
            $email = $m->technicien?->email ?? collect(Parametre::get('email_alertes_destinataires', []))->first();
            if ($email) {
                $notifications->email(null, $email, "Maintenance prévue aujourd'hui : {$m->reference}",
                    "{$m->borne->nom} — {$m->borne->adresse}\n".($m->titre ? "{$m->titre}\n" : '').$m->description);
            }
        }

        $documents = Document::with('borne')
            ->whereIn('type', ['contrat', 'garantie'])
            ->whereDate('date_expiration', today()->addDays(30))
            ->get();

        foreach ($documents as $d) {
            foreach (Parametre::get('email_alertes_destinataires', []) as $email) {
                $notifications->email(null, $email, "Échéance dans 30 jours : {$d->titre}",
                    ucfirst($d->type)." « {$d->titre} »".($d->borne ? " ({$d->borne->nom})" : '').' expire le '.$d->date_expiration->format('d/m/Y').'.');
            }
        }

        $this->info($ordres->count().' rappel(s) de maintenance, '.$documents->count().' échéance(s) de document.');

        return self::SUCCESS;
    }
}
