<?php

namespace App\Jobs;

use App\Models\Alerte;
use App\Services\Notifications;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** Envoi asynchrone des notifications d'une alerte (php artisan queue:work). */
class EnvoyerNotificationsAlerte implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public Alerte $alerte) {}

    public function handle(Notifications $notifications): void
    {
        $notifications->notifierAlerte($this->alerte);
    }
}
