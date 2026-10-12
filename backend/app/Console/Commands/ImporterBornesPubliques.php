<?php

namespace App\Console\Commands;

use App\Models\Borne;
use Illuminate\Console\Command;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Importe les bornes publiques de Tunisie depuis une source ouverte, en
 * consultation seule (source = publique) : elles apparaissent sur la carte
 * mais ne sont pas pilotables, n'étant pas reliées au serveur OCPP.
 *
 * Open Charge Map (plus complet) si OCM_API_KEY est défini, sinon OpenStreetMap.
 * Relancer la commande met à jour les bornes déjà importées.
 */
class ImporterBornesPubliques extends Command
{
    protected $signature = 'bornes:importer-publiques';

    protected $description = 'Importe les bornes de recharge publiques de Tunisie (Open Charge Map ou OpenStreetMap)';

    private const USER_AGENT = 'Volteo/1.0 (import bornes publiques Tunisie)';

    private const OVERPASS = [
        'https://overpass.private.coffee/api/interpreter',
        'https://overpass-api.de/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ];

    public function handle(): int
    {
        $cle = config('services.ocm.key');

        $bornes = $cle ? $this->depuisOpenChargeMap($cle) : $this->depuisOpenStreetMap();

        if ($bornes === null) {
            $this->error('Source indisponible pour le moment, réessayez plus tard.');

            return self::FAILURE;
        }

        foreach ($bornes as $b) {
            DB::transaction(function () use ($b) {
                $borne = Borne::updateOrCreate(['source_id' => $b['source_id']], [
                    'source' => 'publique',
                    'reference' => $b['reference'],
                    'nom' => $b['nom'],
                    'operateur' => $b['operateur'],
                    'adresse' => $b['adresse'],
                    'latitude' => $b['latitude'],
                    'longitude' => $b['longitude'],
                    'puissance_kw' => $b['puissance_kw'],
                    'etat' => $b['etat'],
                    'tarif_kwh' => 0,
                ]);

                $borne->connecteurs()->delete();
                foreach ($b['connecteurs'] as $c) {
                    $borne->connecteurs()->create([...$c, 'etat' => 'inconnu']);
                }
            });

            $this->line("  • {$b['nom']} — {$b['adresse']}");
        }

        $this->info(count($bornes).' borne(s) publique(s) importée(s) depuis '.($cle ? 'Open Charge Map' : 'OpenStreetMap').'.');

        return self::SUCCESS;
    }

    /** @return list<array<string, mixed>>|null */
    private function depuisOpenChargeMap(string $cle): ?array
    {
        $reponse = Http::withHeaders(['User-Agent' => self::USER_AGENT])
            ->timeout(60)
            ->get('https://api.openchargemap.io/v3/poi/', [
                'countrycode' => 'TN',
                'maxresults' => 2000,
                'compact' => 'false',
                'verbose' => 'false',
                'key' => $cle,
            ]);

        if (! $reponse->successful()) {
            return null;
        }

        return collect($reponse->json())->map(function (array $poi) {
            $adresse = $poi['AddressInfo'] ?? [];

            $connecteurs = collect($poi['Connections'] ?? [])->map(fn (array $c) => [
                'type' => $this->typeConnecteur(
                    $c['ConnectionType']['Title'] ?? '',
                    $c['CurrentType']['Title'] ?? ''
                ),
                'puissance_kw' => (int) round($c['PowerKW'] ?? 0) ?: 22,
            ])->values()->all();

            $operationnel = $poi['StatusType']['IsOperational'] ?? null;

            return [
                'source_id' => 'ocm:'.$poi['ID'],
                'reference' => 'PUB-OCM-'.$poi['ID'],
                'nom' => $this->nettoyer($adresse['Title'] ?? '') ?: 'Borne de recharge publique',
                'operateur' => $poi['OperatorInfo']['Title'] ?? null,
                'adresse' => collect([$adresse['AddressLine1'] ?? null, $adresse['Town'] ?? null])
                    ->filter()->implode(', ') ?: 'Tunisie',
                'latitude' => $adresse['Latitude'],
                'longitude' => $adresse['Longitude'],
                'puissance_kw' => collect($connecteurs)->max('puissance_kw'),
                'etat' => $operationnel === false ? 'hors_service' : 'inconnu',
                'connecteurs' => $connecteurs,
            ];
        })->all();
    }

    /** @return list<array<string, mixed>>|null */
    private function depuisOpenStreetMap(): ?array
    {
        $requete = '[out:json][timeout:90];area["ISO3166-1"="TN"][admin_level=2]->.tn;'
            .'(node["amenity"="charging_station"](area.tn);way["amenity"="charging_station"](area.tn););out center tags;';

        $elements = null;
        foreach (self::OVERPASS as $url) {
            try {
                $reponse = Http::withHeaders(['User-Agent' => self::USER_AGENT])
                    ->timeout(100)
                    ->asForm()
                    ->post($url, ['data' => $requete]);
            } catch (ConnectionException) {
                $this->warn("  Miroir injoignable : {$url}");

                continue;
            }

            if ($reponse->successful() && is_array($reponse->json('elements'))) {
                $elements = $reponse->json('elements');
                break;
            }
        }

        if ($elements === null) {
            return null;
        }

        return collect($elements)->map(function (array $e) {
            $tags = $e['tags'] ?? [];
            $lat = $e['lat'] ?? $e['center']['lat'];
            $lon = $e['lon'] ?? $e['center']['lon'];

            $prises = [
                'socket:type2_combo' => 'CCS',
                'socket:type2' => 'Type2',
                'socket:type2_cable' => 'Type2',
                'socket:chademo' => 'CHAdeMO',
            ];
            $connecteurs = [];
            foreach ($prises as $tag => $type) {
                $nombre = (int) ($tags[$tag] ?? 0);
                $puissance = (int) round((float) ($tags["$tag:output"] ?? 0)) ?: ($type === 'Type2' ? 22 : 50);
                for ($i = 0; $i < min($nombre, 8); $i++) {
                    $connecteurs[] = ['type' => $type, 'puissance_kw' => $puissance];
                }
            }

            $operateur = $tags['operator'] ?? $tags['brand'] ?? null;
            $nom = $this->nettoyer($tags['name'] ?? '')
                ?: ($operateur ? "Borne {$operateur}" : 'Borne de recharge publique');

            return [
                'source_id' => "osm:{$e['type']}/{$e['id']}",
                'reference' => 'PUB-OSM-'.strtoupper(substr($e['type'], 0, 1)).$e['id'],
                'nom' => $nom,
                'operateur' => $operateur,
                'adresse' => $this->adresseOsm($tags, $lat, $lon),
                'latitude' => $lat,
                'longitude' => $lon,
                'puissance_kw' => collect($connecteurs)->max('puissance_kw'),
                'etat' => 'inconnu',
                'connecteurs' => $connecteurs,
            ];
        })->all();
    }

    /** Adresse depuis les tags OSM, sinon géocodage inverse Nominatim (1 requête/s max). */
    private function adresseOsm(array $tags, float $lat, float $lon): string
    {
        $rue = trim(($tags['addr:housenumber'] ?? '').' '.($tags['addr:street'] ?? ''));
        $ville = $tags['addr:city'] ?? null;
        if ($rue || $ville) {
            return collect([$rue ?: null, $ville])->filter()->implode(', ');
        }

        sleep(1);
        $reponse = Http::withHeaders(['User-Agent' => self::USER_AGENT, 'Accept-Language' => 'fr'])
            ->timeout(20)
            ->get('https://nominatim.openstreetmap.org/reverse', [
                'lat' => $lat, 'lon' => $lon, 'format' => 'jsonv2', 'zoom' => 17,
            ]);

        $a = $reponse->json('address') ?? [];
        $adresse = collect([
            $a['road'] ?? null,
            $a['suburb'] ?? $a['neighbourhood'] ?? null,
            $a['city'] ?? $a['town'] ?? $a['village'] ?? $a['state'] ?? null,
        ])->filter()->unique()->implode(', ');

        return $adresse ?: 'Tunisie';
    }

    private function typeConnecteur(string $titre, string $courant): string
    {
        return match (true) {
            Str::contains($titre, 'CCS', true) => 'CCS',
            Str::contains($titre, 'CHAdeMO', true) => 'CHAdeMO',
            Str::contains($titre, 'Type 2', true) => 'Type2',
            Str::contains($courant, 'DC', true) => 'DC',
            default => 'AC',
        };
    }

    /** Retire les caractères parasites saisis dans les noms (ex. « shell sidi hassine 2$ »). */
    private function nettoyer(string $nom): string
    {
        $nom = trim(preg_replace('/[^\p{L}\p{N})]+$/u', '', $nom) ?? '');

        return $nom === '' ? '' : Str::ucfirst($nom);
    }
}
