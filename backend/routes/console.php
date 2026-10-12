<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Lancer `php artisan schedule:work` en développement (cron `schedule:run` en production).

// Supervision : détection des bornes silencieuses.
Schedule::command('bornes:verifier-heartbeats')->everyMinute();

// Abonnements : renouvellement / expiration.
Schedule::command('abonnements:traiter-echeances')->dailyAt('00:10');

// Maintenance préventive du jour et échéances de contrats / garanties.
Schedule::command('maintenances:rappels')->dailyAt('07:00');
