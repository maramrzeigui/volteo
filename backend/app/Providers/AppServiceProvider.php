<?php

namespace App\Providers;

use Anthropic\Client;
use App\Jobs\EnvoyerNotificationsAlerte;
use App\Models\Alerte;
use App\Models\Borne;
use App\Models\DeploiementFirmware;
use App\Models\SessionRecharge;
use App\Services\Assistant\ClaudeModele;
use App\Services\Assistant\ModeleIA;
use App\Services\Assistant\ModeleNonConfigure;
use App\Services\Assistant\OllamaModele;
use App\Services\TempsReel;
use App\Support\Perimetre;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Périmètre de données du back-office (une instance par requête).
        $this->app->scoped(Perimetre::class);
        // Assistant IA : moteur choisi dans .env (ASSISTANT_MOTEUR) :
        // « ollama » = modèle local (gratuit, données sur le serveur), « claude » = API Anthropic.
        $this->app->bind(ModeleIA::class, fn () => match (config('assistant.moteur')) {
            'ollama' => new OllamaModele(config('assistant.ollama_url'), config('assistant.ollama_modele')),
            'claude' => config('assistant.cle_api')
                ? new ClaudeModele(new Client(
                    apiKey: config('assistant.cle_api'),
                    baseUrl: config('assistant.url_api') ?: null,
                    requestOptions: ['timeout' => config('assistant.delai'), 'maxRetries' => 2],
                ))
                : new ModeleNonConfigure,
            default => new ModeleNonConfigure,
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // L'app mobile attend des tableaux bruts, sans enveloppe {"data": ...}.
        JsonResource::withoutWrapping();

        // Supervision temps réel (module 4) : chaque changement d'état part vers le back-office.
        Borne::updated(function (Borne $borne) {
            if ($borne->wasChanged(['etat', 'dernier_heartbeat', 'temperature_c'])) {
                TempsReel::borne($borne);
            }
        });
        SessionRecharge::saved(fn (SessionRecharge $s) => TempsReel::session($s));
        DeploiementFirmware::saved(fn (DeploiementFirmware $d) => TempsReel::firmware($d));

        // Alertes automatiques (module 12) : diffusion immédiate + notifications en file d'attente.
        Alerte::created(function (Alerte $alerte) {
            TempsReel::alerte($alerte);
            EnvoyerNotificationsAlerte::dispatch($alerte);
        });
    }
}
