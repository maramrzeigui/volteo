<?php

namespace App\Console\Commands;

use App\Models\BadgeRfid;
use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\Vehicule;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

/**
 * Configure le simulateur de bornes OCPP-J de SAP
 * (github.com/SAP/e-mobility-charging-stations-simulator) à partir des bornes
 * réellement enregistrées : un modèle par borne (référence, prises, puissances,
 * constructeur, firmware), l'URL de supervision et un mot de passe OCPP neuf
 * par borne (Security Profile 1), plus la liste des badges RFID actifs.
 *
 *   php artisan ocpp:simulateur-sap ../../e-mobility-charging-stations-simulator
 *   puis, dans le dossier du simulateur : pnpm start
 */
class GenererSimulateurSap extends Command
{
    protected $signature = 'ocpp:simulateur-sap
        {dossier : Dossier du simulateur SAP (contenant src/assets)}
        {--references=* : Références des bornes à simuler (toutes les bornes du réseau par défaut)}
        {--atg : Active le générateur automatique de recharges au badge RFID}
        {--url= : URL de supervision OCPP (par défaut OCPP_URL_PUBLIQUE)}';

    protected $description = 'Génère la configuration du simulateur de bornes SAP depuis les bornes de la base';

    /** Prises en courant continu (recharge rapide). */
    private const TYPES_DC = ['CCS', 'CHAdeMO', 'DC'];

    private const DOSSIER_MODELES = 'station-templates/borneapp';

    private const FICHIER_BADGES = 'idtags-borneapp.json';

    private const FICHIER_VEHICULES = 'ev-profiles-borneapp.json';

    public function handle(): int
    {
        $assets = rtrim($this->argument('dossier'), '/').'/src/assets';
        if (! File::isDirectory($assets)) {
            $this->error("Dossier introuvable : {$assets}. Indiquez la racine du simulateur SAP.");

            return self::FAILURE;
        }

        $bornes = Borne::with(['connecteurs' => fn ($q) => $q->orderBy('id')])
            ->where('source', 'reseau')
            ->when($this->option('references'), fn ($q, $refs) => $q->whereIn('reference', $refs))
            ->orderBy('reference')
            ->get()
            ->filter(fn (Borne $b) => $b->connecteurs->isNotEmpty());

        if ($bornes->isEmpty()) {
            $this->error('Aucune borne du réseau avec des prises à simuler.');

            return self::FAILURE;
        }

        $url = $this->option('url') ?: config('services.ocpp.url_publique');
        // Serveur UI du simulateur (pilotage des bornes) : local et protégé par un mot de passe aléatoire.
        $authUi = ['enabled' => true, 'type' => 'protocol-basic-auth', 'username' => 'borneapp', 'password' => Str::password(24, symbols: false)];

        File::deleteDirectory("{$assets}/".self::DOSSIER_MODELES);
        File::ensureDirectoryExists("{$assets}/".self::DOSSIER_MODELES);

        $modeles = [];
        foreach ($bornes as $borne) {
            $motDePasse = Borne::genererMotDePasseOcpp();
            $borne->forceFill(['ocpp_mot_de_passe' => $motDePasse])->save();

            $fichier = self::DOSSIER_MODELES."/{$borne->reference}.station-template.json";
            $this->ecrireJson("{$assets}/{$fichier}", $this->modele($borne, $motDePasse));
            $modeles[] = ['file' => str_replace('station-templates/', '', $fichier), 'numberOfStations' => 1];
        }

        $badges = BadgeRfid::where('actif', true)->where('bloque', false)
            ->whereNotNull('user_id')->pluck('uid')->values()->all();
        $this->ecrireJson("{$assets}/".self::FICHIER_BADGES, $badges ?: ['AUCUN-BADGE']);
        $this->ecrireJson("{$assets}/".self::FICHIER_VEHICULES, ['profiles' => $this->profilsVehicules()]);

        $this->ecrireJson("{$assets}/config.json", [
            '$schemaVersion' => 1,
            'supervisionUrls' => [$url],
            'supervisionUrlDistribution' => 'round-robin',
            'log' => ['file' => 'logs/combined.log', 'errorFile' => 'logs/error.log', 'maxFiles' => 7, 'statisticsInterval' => 0],
            'worker' => ['processType' => 'workerSet'],
            'performanceStorage' => ['enabled' => false, 'type' => 'none'],
            'uiServer' => [
                'enabled' => true,
                'type' => 'ws',
                'options' => ['host' => '127.0.0.1', 'port' => 8080],
                'authentication' => $authUi,
            ],
            'persistState' => false,
            'stationTemplateUrls' => $modeles,
        ]);

        // Interface web du simulateur (ui/web) : même serveur UI, mêmes identifiants.
        $interface = rtrim($this->argument('dossier'), '/').'/ui/web/public';
        if (File::isDirectory(dirname($interface))) {
            File::ensureDirectoryExists($interface);
            $this->ecrireJson("{$interface}/config.json", [
                'skin' => 'modern',
                'theme' => 'rose-pine',
                'uiServer' => ['host' => '127.0.0.1', 'port' => 8080, 'protocol' => 'ui', 'version' => '0.0.1', 'name' => 'Bornes Volteo', 'authentication' => $authUi],
            ]);
        }

        $this->table(['Borne', 'Prises', 'Puissance', 'Type'], $bornes->map(fn (Borne $b) => [
            $b->reference,
            $b->connecteurs->map(fn (Connecteur $c) => "{$c->type} {$c->puissance_kw} kW")->join(', '),
            $this->puissanceTotaleKw($b).' kW',
            $this->courant($b),
        ])->all());

        $this->info("{$bornes->count()} borne(s) configurée(s) vers {$url}, ".count($badges).' badge(s) RFID.');
        $this->line('Nouveaux mots de passe OCPP enregistrés (les anciens ne sont plus valides).');
        $this->line('Lancer le simulateur : cd '.$this->argument('dossier').' && pnpm start');
        $this->line('Interface web       : cd '.$this->argument('dossier').'/ui/web && pnpm exec vite --port 5174   (http://localhost:5174)');

        return self::SUCCESS;
    }

    /** Modèle de borne au format du simulateur SAP. */
    private function modele(Borne $borne, string $motDePasse): array
    {
        $dc = $this->courant($borne) === 'DC';
        $mesures = [
            ['unit' => 'Percent', 'context' => 'Sample.Periodic', 'measurand' => 'SoC', 'location' => 'EV'],
            ['unit' => 'W', 'context' => 'Sample.Periodic', 'measurand' => 'Power.Active.Import'],
            ['unit' => 'Wh', 'context' => 'Sample.Periodic', 'measurand' => 'Energy.Active.Import.Register'],
        ];

        $prises = ['0' => (object) []];
        foreach ($borne->connecteurs->values() as $i => $connecteur) {
            $prises[(string) ($i + 1)] = [
                'bootStatus' => 'Available',
                'maximumPower' => (int) $connecteur->puissance_kw * 1000,
                'MeterValues' => $mesures,
            ];
        }

        return array_filter([
            '$schemaVersion' => 1,
            'baseName' => $borne->reference,
            'fixedName' => true,
            'supervisionUser' => $borne->reference,
            'supervisionPassword' => $motDePasse,
            'ocppVersion' => '1.6',
            'ocppStrictCompliance' => true,
            'idTagsFile' => self::FICHIER_BADGES,
            'chargePointModel' => $borne->modele ?: 'Volteo',
            'chargePointVendor' => $borne->fabricant ?: 'Volteo',
            'chargePointSerialNumber' => $borne->numero_serie,
            'firmwareVersion' => $borne->version_firmware,
            'firmwareVersionPattern' => '^.+$',
            'power' => $this->puissanceTotaleKw($borne) * 1000,
            'powerUnit' => 'W',
            'powerSharedByConnectors' => false,
            'currentOutType' => $dc ? 'DC' : 'AC',
            'numberOfPhases' => $dc ? 0 : 3,
            'voltageOut' => $dc ? 400 : 230,
            'numberOfConnectors' => $borne->connecteurs->count(),
            'useConnectorId0' => true,
            'randomConnectors' => false,
            'mainVoltageMeterValues' => false,
            // Mesures cohérentes (P = U·I, E = P·t, batterie croissante) selon le profil du véhicule branché.
            'coherentMeterValues' => true,
            'evProfilesFile' => self::FICHIER_VEHICULES,
            'beginEndMeterValues' => false,
            'postTransactionDelay' => 2,
            'resetTime' => 20,
            'enableStatistics' => false,
            'autoReconnectMaxRetries' => -1,
            'reconnectExponentialDelay' => true,
            'registrationMaxRetries' => -1,
            'Configuration' => ['configurationKey' => [
                ['key' => 'MeterValuesSampledData', 'readonly' => false, 'value' => 'SoC,Power.Active.Import,Energy.Active.Import.Register'],
                ['key' => 'MeterValueSampleInterval', 'readonly' => false, 'value' => '10'],
                ['key' => 'SupportedFeatureProfiles', 'readonly' => true, 'value' => 'Core,FirmwareManagement,LocalAuthListManagement,SmartCharging,RemoteTrigger,Reservation'],
                ['key' => 'AuthorizeRemoteTxRequests', 'readonly' => false, 'value' => 'false'],
                ['key' => 'LocalAuthListEnabled', 'readonly' => false, 'value' => 'false'],
                ['key' => 'WebSocketPingInterval', 'readonly' => false, 'value' => '30'],
                ['key' => 'ReserveConnectorZeroSupported', 'readonly' => false, 'value' => 'false'],
            ]],
            'AutomaticTransactionGenerator' => [
                'enable' => (bool) $this->option('atg'),
                'minDuration' => 120,
                'maxDuration' => 420,
                'minDelayBetweenTwoTransactions' => 60,
                'maxDelayBetweenTwoTransactions' => 240,
                'probabilityOfStart' => 0.6,
                'stopAfterHours' => 2,
                'requireAuthorize' => true,
            ],
            // Objet JSON indexé par numéro de prise (json_encode ferait une liste de clés 0..n).
            'Connectors' => (object) $prises,
        ], fn ($v) => $v !== null);
    }

    /**
     * Profils de véhicules pour le simulateur : un par modèle enregistré dans la base
     * (capacité réelle de la batterie), pondéré par le nombre de véhicules du modèle.
     * Courbe de charge typique : pleine puissance puis réduction au-delà de 80 % (CC/CV).
     */
    private function profilsVehicules(): array
    {
        $profils = Vehicule::query()
            ->selectRaw('marque, modele, type_connecteur, MAX(capacite_batterie_kwh) as capacite, COUNT(*) as nombre')
            ->groupBy('marque', 'modele', 'type_connecteur')
            ->get()
            ->map(function ($v) {
                $dc = in_array($v->type_connecteur, self::TYPES_DC, true);
                $capaciteWh = (int) $v->capacite * 1000;

                return [
                    'id' => Str::slug("{$v->marque} {$v->modele}"),
                    'weight' => (int) $v->nombre,
                    'batteryCapacityWh' => $capaciteWh,
                    // Recharge rapide ≈ 2 C (plafonnée à 250 kW) ; chargeur embarqué AC 11 kW.
                    'maxPowerW' => $dc ? min(250_000, $capaciteWh * 2) : 11_000,
                    'initialSocPercentMin' => 12,
                    'initialSocPercentMax' => 45,
                    'rampShape' => 'sigmoid',
                    'chargingCurve' => $dc
                        ? [['socPercent' => 0, 'powerFraction' => 1.0], ['socPercent' => 55, 'powerFraction' => 1.0], ['socPercent' => 80, 'powerFraction' => 0.55], ['socPercent' => 90, 'powerFraction' => 0.3], ['socPercent' => 100, 'powerFraction' => 0.06]]
                        : [['socPercent' => 0, 'powerFraction' => 1.0], ['socPercent' => 85, 'powerFraction' => 1.0], ['socPercent' => 95, 'powerFraction' => 0.5], ['socPercent' => 100, 'powerFraction' => 0.1]],
                ];
            })
            ->unique('id')
            ->values()
            ->all();

        return $profils ?: [[
            'id' => 'vehicule-type', 'weight' => 1, 'batteryCapacityWh' => 60_000, 'maxPowerW' => 100_000,
            'initialSocPercentMin' => 15, 'initialSocPercentMax' => 45,
            'chargingCurve' => [['socPercent' => 0, 'powerFraction' => 1.0], ['socPercent' => 80, 'powerFraction' => 0.5], ['socPercent' => 100, 'powerFraction' => 0.06]],
        ]];
    }

    private function courant(Borne $borne): string
    {
        return $borne->connecteurs->contains(fn (Connecteur $c) => in_array($c->type, self::TYPES_DC, true)) ? 'DC' : 'AC';
    }

    private function puissanceTotaleKw(Borne $borne): int
    {
        return (int) $borne->connecteurs->sum('puissance_kw');
    }

    private function ecrireJson(string $chemin, mixed $donnees): void
    {
        File::put($chemin, json_encode($donnees, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n");
    }
}
