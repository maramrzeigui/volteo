<?php

namespace App\Services\Assistant;

use App\Models\Borne;
use App\Models\User;
use App\Services\Tarification;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * « Trajet Volta » : planifie un voyage en voiture électrique à travers la Tunisie avec
 * les bornes du réseau Volteo (arrêts, batterie à chaque étape, temps et coût), puis
 * le modèle rédige un court commentaire. Le calcul est déterministe et ne dépend pas de l'IA.
 */
class PlanificateurTrajet
{
    /** Villes proposées (centre-ville). */
    public const VILLES = [
        'tunis' => ['nom' => 'Tunis', 'lat' => 36.8065, 'lng' => 10.1815],
        'bizerte' => ['nom' => 'Bizerte', 'lat' => 37.2744, 'lng' => 9.8739],
        'tabarka' => ['nom' => 'Tabarka', 'lat' => 36.9544, 'lng' => 8.7580],
        'nabeul' => ['nom' => 'Nabeul', 'lat' => 36.4561, 'lng' => 10.7376],
        'hammamet' => ['nom' => 'Hammamet', 'lat' => 36.4000, 'lng' => 10.6167],
        'kairouan' => ['nom' => 'Kairouan', 'lat' => 35.6781, 'lng' => 10.0963],
        'sousse' => ['nom' => 'Sousse', 'lat' => 35.8256, 'lng' => 10.6084],
        'monastir' => ['nom' => 'Monastir', 'lat' => 35.7643, 'lng' => 10.8113],
        'mahdia' => ['nom' => 'Mahdia', 'lat' => 35.5047, 'lng' => 11.0622],
        'sfax' => ['nom' => 'Sfax', 'lat' => 34.7406, 'lng' => 10.7603],
        'gafsa' => ['nom' => 'Gafsa', 'lat' => 34.4250, 'lng' => 8.7842],
        'gabes' => ['nom' => 'Gabès', 'lat' => 33.8815, 'lng' => 10.0982],
        'tozeur' => ['nom' => 'Tozeur', 'lat' => 33.9197, 'lng' => 8.1335],
        'djerba' => ['nom' => 'Djerba', 'lat' => 33.8750, 'lng' => 10.8575],
    ];

    /** Distance routière ≈ distance à vol d'oiseau × ce facteur. */
    private const FACTEUR_ROUTE = 1.25;

    private const RESERVE = 10; // % gardés à l'arrivée de chaque étape

    private const CIBLE_MAX = 80; // au-delà, la recharge ralentit fortement (dépassé seulement si nécessaire)

    private const VITESSE_MOYENNE = 80; // km/h

    private const MAX_ARRETS = 4;

    /** Recharge AC limitée par le chargeur embarqué du véhicule. */
    private const PUISSANCE_AC_MAX = 11;

    public function __construct(private readonly ModeleIA $modele, private readonly Tarification $tarification) {}

    /** @return list<array{cle: string, nom: string}> */
    public static function villes(): array
    {
        return collect(self::VILLES)->map(fn ($v, $cle) => ['cle' => $cle, 'nom' => $v['nom'], 'lat' => $v['lat'], 'lng' => $v['lng']])->values()->all();
    }

    /**
     * @param  array{nom: string, lat: float, lng: float}  $a  départ (ex. position GPS du conducteur)
     * @param  array{nom: string, lat: float, lng: float}  $b  destination
     * @param  list<int>  $arretsImposes  bornes choisies par le conducteur, dans l'ordre
     */
    public function planifier(User $user, array $a, array $b, ?int $batterie = null, array $arretsImposes = []): array
    {
        $vehicule = $user->vehicules()->first();
        $capacite = (float) ($vehicule?->capacite_batterie_kwh ?: 60);
        $prise = $vehicule?->type_connecteur ?? 'CCS';
        // Consommation sur route (un peu plus qu'en ville).
        $conso = (float) config('assistant.kwh_aux_100_km', 17) * 1.1;
        $batterie ??= $user->sessions()->where('etat', 'terminee')->whereNotNull('pourcentage_batterie')->latest('date_debut')->value('pourcentage_batterie') ?? 80;
        $batterie = max(5, min(100, $batterie));

        $bornes = Borne::with(['connecteurs', 'tarif', 'tarifSpecial'])->ouvertesAuPublic()
            ->where('source', 'reseau')
            ->get()
            ->filter(fn (Borne $x) => $x->accepteRecharge() && $this->puissancePour($x, $prise) > 0)
            ->keyBy('id');

        $pourcentPour = fn (float $km) => $km * $conso / 100 / $capacite * 100;
        $kmPour = fn (float $pourcent) => max(0, $pourcent) / 100 * $capacite / $conso * 100;

        // Étapes à atteindre dans l'ordre : bornes choisies par le conducteur, puis la destination.
        $imposees = collect($arretsImposes)->map(fn ($id) => $bornes->get($id))->filter()->values();
        $cibles = [...$imposees->map(fn (Borne $x) => ['borne' => $x])->all(), ['destination' => $b]];

        $etapes = [['type' => 'depart', 'nom' => $a['nom'], 'batterie' => $batterie, 'lat' => $a['lat'], 'lng' => $a['lng']]];
        $position = $a;
        $niveau = (float) $batterie;
        $utilisees = $imposees->pluck('id')->all();
        $atteint = false;
        $bloque = null;

        foreach ($cibles as $n => $cible) {
            $but = isset($cible['borne']) ? $this->point($cible['borne']) : $cible['destination'];
            // Point suivant après ce but (pour savoir combien recharger sur une borne choisie).
            $apres = $cibles[$n + 1] ?? null;
            $pointApres = $apres ? (isset($apres['borne']) ? $this->point($apres['borne']) : $apres['destination']) : null;

            for ($i = 0; ; $i++) {
                $reste = $this->route($position, $but);
                if ($kmPour($niveau - (isset($cible['borne']) ? 3 : self::RESERVE)) >= $reste) {
                    $niveau -= $pourcentPour($reste);
                    if (isset($cible['borne'])) {
                        [$etape, $niveau] = $this->recharger($cible['borne'], $prise, $capacite, $niveau, $reste, $pointApres ? $pourcentPour($this->route($but, $pointApres)) : 0, true);
                        $etapes[] = $etape;
                        $position = $but;
                    } else {
                        $etapes[] = ['type' => 'arrivee', 'nom' => $b['nom'], 'km' => (int) round($reste), 'batterie' => (int) floor($niveau), 'lat' => $b['lat'], 'lng' => $b['lng']];
                        $atteint = true;
                    }
                    break;
                }
                if ($i >= self::MAX_ARRETS) {
                    $bloque = isset($cible['borne']) ? $cible['borne']->nom : $b['nom'];
                    break 2;
                }

                // Borne atteignable qui rapproche le plus du but (les plus puissantes sont favorisées).
                $choix = $bornes
                    ->reject(fn (Borne $x) => in_array($x->id, $utilisees, true))
                    ->map(fn (Borne $x) => [
                        'borne' => $x,
                        'aller' => $this->route($position, $this->point($x)),
                        'restant' => $this->route($this->point($x), $but),
                    ])
                    // Une borne sur place (moins de 10 km) permet de recharger avant de partir.
                    ->filter(fn ($c) => $c['aller'] <= $kmPour($niveau - 5) && ($c['restant'] < $reste - 5 || $c['aller'] < 10))
                    ->sortBy(fn ($c) => $c['restant'] - $this->puissancePour($c['borne'], $prise) / 4)
                    ->first();

                if (! $choix) {
                    $bloque = isset($cible['borne']) ? $cible['borne']->nom : $b['nom'];
                    break 2;
                }

                $borne = $choix['borne'];
                $niveau -= $pourcentPour($choix['aller']);
                $besoin = $pourcentPour($choix['restant']);

                // Sur une borne lente, on recharge seulement de quoi rejoindre une borne bien plus
                // rapide plus loin sur la route : le voyage est nettement plus court.
                $puissance = $this->puissancePour($borne, $prise);
                $relais = $bornes
                    ->reject(fn (Borne $x) => $x->id === $borne->id || in_array($x->id, $utilisees, true))
                    ->filter(fn (Borne $x) => $this->puissancePour($x, $prise) >= max(2 * $puissance, 50)
                        && $this->route($this->point($x), $but) < $choix['restant'] - 5)
                    ->sortBy(fn (Borne $x) => $this->route($this->point($borne), $this->point($x)))
                    ->first();
                if ($relais) {
                    $besoin = min($besoin, $pourcentPour($this->route($this->point($borne), $this->point($relais))));
                }

                [$etape, $niveau] = $this->recharger($borne, $prise, $capacite, $niveau, $choix['aller'], $besoin, false);
                $etapes[] = $etape;
                $utilisees[] = $borne->id;
                $position = $this->point($borne);
            }
        }

        // Distances réelles par la route (OSRM) : la batterie est recalculée étape par étape.
        $route = $this->itineraire(array_map(fn ($e) => ['lat' => $e['lat'], 'lng' => $e['lng']], $etapes));
        if ($route && count($route['legs']) === count($etapes) - 1) {
            $etapes = $this->recalculer($etapes, $route['legs'], $pourcentPour, $capacite, $prise, $bornes);
            $last = end($etapes);
            if ($atteint && $last['batterie'] < 3) {
                $atteint = false;
                $bloque = $b['nom'];
            }
        }

        $distanceTotale = array_sum(array_map(fn ($e) => $e['km'] ?? 0, $etapes));
        $recharges = array_values(array_filter($etapes, fn ($e) => $e['type'] === 'recharge'));
        $litres = $distanceTotale / 100 * (float) config('assistant.litres_aux_100_km', 7);
        $arrivee = $atteint ? end($etapes)['batterie'] : null;

        $plan = [
            'depart' => $a['nom'],
            'arrivee' => $b['nom'],
            'possible' => $atteint,
            // Diagnostic : la batterie suffit-elle, faut-il recharger, ou est-ce impossible ?
            'verdict' => ! $atteint ? 'impossible' : (count($recharges) === 0 ? 'batterie_suffit' : 'recharge_necessaire'),
            'bloqueA' => $bloque,
            'etapes' => $etapes,
            'distanceKm' => (int) round($atteint ? $distanceTotale : $this->route($a, $b)),
            'minutesConduite' => (int) round(($route['minutes'] ?? $distanceTotale / self::VITESSE_MOYENNE * 60)),
            'minutesRecharge' => array_sum(array_column($recharges, 'minutes')),
            'coutDt' => round(array_sum(array_column($recharges, 'prix')), 2),
            'coutEssenceDt' => round($litres * (float) config('assistant.prix_carburant_litre', 2.525), 2),
            'vehicule' => $vehicule ? "{$vehicule->marque} {$vehicule->modele}" : null,
            'routeReelle' => (bool) $route,
            // Tracé à dessiner sur la carte [[lat, lng], …].
            'trace' => $route['trace'] ?? array_map(fn ($e) => [$e['lat'], $e['lng']], $etapes),
            // Guidage pas à pas (vide sans itinéraire routier).
            'instructions' => $route['instructions'] ?? [],
            'conseil' => $atteint && $arrivee !== null && $arrivee < 20 ? "Vous arriverez avec peu de batterie ({$arrivee} %) : prévoyez de recharger à l’arrivée." : null,
        ];

        return [...$plan, ...$this->commenter($plan)];
    }

    /**
     * Recharge sur une borne : juste ce qu'il faut pour l'étape suivante (+ marge), 80 % en
     * principe, jusqu'à 100 % seulement si nécessaire (la recharge ralentit alors nettement).
     *
     * @return array{0: array, 1: float} [étape, niveau au départ de la borne]
     */
    private function recharger(Borne $borne, string $prise, float $capacite, float $arrivee, float $kmAller, float $besoinSuivant, bool $choisie): array
    {
        $cible = min(100, max($arrivee + 10, self::RESERVE + $besoinSuivant + 8));
        $puissance = $this->puissancePour($borne, $prise);
        [$minutes, $prix] = $this->coutRecharge($borne, $puissance, $capacite, $arrivee, $cible);

        return [[
            'type' => 'recharge',
            'nom' => $borne->nom,
            'borneId' => $borne->id,
            'choisie' => $choisie,
            'km' => (int) round($kmAller),
            'batterieArrivee' => (int) floor($arrivee),
            'batterieDepart' => (int) round($cible),
            'puissanceKw' => $puissance,
            'minutes' => $minutes,
            'prix' => $prix,
            'etat' => $borne->etat,
            'lat' => (float) $borne->latitude,
            'lng' => (float) $borne->longitude,
        ], $cible];
    }

    /** @return array{0: int, 1: float} [minutes, prix] */
    private function coutRecharge(Borne $borne, int $puissance, float $capacite, float $de, float $a): array
    {
        $energie = max(0, $a - $de) / 100 * $capacite;
        $rapide = max(0, min($a, self::CIBLE_MAX) - $de) / 100 * $capacite;
        $lente = max(0, $a - max($de, self::CIBLE_MAX)) / 100 * $capacite;
        $minutes = (int) ceil(($rapide / ($puissance * 0.85) + $lente / ($puissance * 0.4)) * 60);
        $prix = $this->tarification->prixBrut($this->tarification->tarifApplicable($borne), (float) $borne->tarif_kwh, $energie, $minutes * 60, $puissance, now());

        return [$minutes, round($prix, 2)];
    }

    /** Recalcule batterie, durée et prix avec les distances routières réelles de chaque tronçon. */
    private function recalculer(array $etapes, array $legs, \Closure $pourcentPour, float $capacite, string $prise, $bornes): array
    {
        $niveau = (float) $etapes[0]['batterie'];
        for ($i = 1; $i < count($etapes); $i++) {
            $km = $legs[$i - 1];
            $etapes[$i]['km'] = (int) round($km);
            $niveau -= $pourcentPour($km);
            if ($etapes[$i]['type'] === 'arrivee') {
                $etapes[$i]['batterie'] = (int) floor($niveau);

                continue;
            }
            $etapes[$i]['batterieArrivee'] = (int) floor($niveau);
            // Assez pour le tronçon suivant, réserve comprise.
            $suivant = $legs[$i] ?? 0;
            $cible = min(100, max($etapes[$i]['batterieDepart'], $niveau + 10, self::RESERVE + $pourcentPour($suivant) + 5));
            $borne = $bornes->get($etapes[$i]['borneId']);
            [$minutes, $prix] = $this->coutRecharge($borne, $this->puissancePour($borne, $prise), $capacite, $niveau, $cible);
            $etapes[$i] = [...$etapes[$i], 'batterieDepart' => (int) round($cible), 'minutes' => $minutes, 'prix' => $prix];
            $niveau = $cible;
        }

        return $etapes;
    }

    /**
     * Itinéraire routier réel (service OSRM, OpenStreetMap) : distance de chaque tronçon,
     * durée de conduite et tracé. null si le service ne répond pas (estimation à vol d'oiseau).
     *
     * @param  list<array{lat: float, lng: float}>  $points
     * @return array{legs: list<float>, minutes: float, trace: list<array{0: float, 1: float}>}|null
     */
    private function itineraire(array $points): ?array
    {
        $base = rtrim((string) config('assistant.osrm_url'), '/');
        if ($base === '' || count($points) < 2) {
            return null;
        }
        $coords = implode(';', array_map(fn ($p) => round($p['lng'], 5).','.round($p['lat'], 5), $points));

        return Cache::remember('osrm:v4:'.md5($coords), now()->addDay(), function () use ($base, $coords) {
            try {
                $r = Http::timeout(8)->withHeaders(['User-Agent' => 'Volteo/1.0'])
                    ->get("{$base}/route/v1/driving/{$coords}", ['overview' => 'full', 'geometries' => 'geojson', 'steps' => 'true']);
                $route = $r->json('routes.0');
                if (! $r->successful() || ! $route) {
                    return null;
                }

                return [
                    'legs' => array_map(fn ($l) => $l['distance'] / 1000, $route['legs']),
                    'minutes' => $route['duration'] / 60,
                    'trace' => $this->alleger(array_map(fn ($c) => [round($c[1], 5), round($c[0], 5)], $route['geometry']['coordinates'])),
                    'instructions' => $this->instructions($route['legs']),
                ];
            } catch (\Throwable $e) {
                Log::info('Trajet Volta : itinéraire routier indisponible', ['message' => $e->getMessage()]);

                return null;
            }
        });
    }

    /** Tracé détaillé allégé à 400 points au plus : suit les rues tout en restant léger à afficher. */
    private function alleger(array $points, int $max = 400): array
    {
        $n = count($points);
        if ($n <= $max) {
            return $points;
        }
        $pas = $n / ($max - 1);
        $garde = [];
        for ($i = 0; $i < $max - 1; $i++) {
            $garde[] = $points[(int) floor($i * $pas)];
        }
        $garde[] = $points[$n - 1];

        return $garde;
    }

    /**
     * Guidage pas à pas en français à partir des manœuvres OSRM.
     *
     * @return list<array{texte: string, icone: string, distanceM: int, lat: float, lng: float}>
     */
    private function instructions(array $legs): array
    {
        $cotes = ['left' => 'à gauche', 'right' => 'à droite', 'slight left' => 'légèrement à gauche', 'slight right' => 'légèrement à droite',
            'sharp left' => 'franchement à gauche', 'sharp right' => 'franchement à droite', 'straight' => 'tout droit', 'uturn' => 'demi-tour'];
        $etapes = [];
        foreach ($legs as $n => $leg) {
            foreach ($leg['steps'] ?? [] as $step) {
                $m = $step['maneuver'] ?? [];
                $type = $m['type'] ?? 'continue';
                $cote = $cotes[$m['modifier'] ?? ''] ?? null;
                $rue = trim($step['name'] ?? '') ?: null;
                $sur = $rue ? " sur {$rue}" : '';
                $texte = match (true) {
                    $type === 'depart' => 'Partez'.($rue ? " par {$rue}" : ''),
                    $type === 'arrive' => $n === count($legs) - 1 ? 'Vous êtes arrivé à destination' : 'Arrêt recharge atteint',
                    in_array($type, ['roundabout', 'rotary'], true) => 'Au rond-point, prenez la '.(($m['exit'] ?? 1) === 1 ? '1re' : ($m['exit'] ?? 1).'e').' sortie'.$sur,
                    $type === 'merge' => 'Insérez-vous'.$sur,
                    in_array($type, ['on ramp', 'off ramp'], true) => 'Prenez la bretelle'.($cote ? " {$cote}" : '').$sur,
                    $type === 'fork' => 'À l’embranchement, restez '.($cote ?? 'sur la voie').$sur,
                    $type === 'end of road' => 'Au bout de la route, tournez '.($cote ?? '').$sur,
                    $cote === 'tout droit' || $type === 'continue' || $type === 'new name' => 'Continuez tout droit'.$sur,
                    $cote === 'demi-tour' => 'Faites demi-tour'.$sur,
                    default => 'Tournez '.($cote ?? '').$sur,
                };
                $icone = match (true) {
                    $type === 'arrive' => 'flag-checkered',
                    in_array($type, ['roundabout', 'rotary'], true) => 'rotate-right',
                    str_contains($m['modifier'] ?? '', 'left') => 'arrow-top-left',
                    str_contains($m['modifier'] ?? '', 'right') => 'arrow-top-right',
                    ($m['modifier'] ?? '') === 'uturn' => 'arrow-u-down-left',
                    default => 'arrow-up',
                };
                [$lng, $lat] = $m['location'] ?? [0, 0];
                $etapes[] = ['texte' => trim(preg_replace('/\s+/', ' ', $texte)), 'icone' => $icone, 'distanceM' => (int) round($step['distance'] ?? 0), 'lat' => round($lat, 6), 'lng' => round($lng, 6)];
            }
        }

        return $etapes;
    }

    /**
     * Recherche de lieux en Tunisie (villes, adresses, lieux connus) via Nominatim (OpenStreetMap).
     *
     * @return list<array{nom: string, detail: string, lat: float, lng: float}>
     */
    public function rechercherLieux(string $texte): array
    {
        $texte = trim($texte);
        $locales = collect(self::VILLES)
            ->filter(fn ($v) => str_starts_with(mb_strtolower($this->sansAccents($v['nom'])), mb_strtolower($this->sansAccents($texte))))
            ->map(fn ($v) => ['nom' => $v['nom'], 'detail' => 'Ville · Tunisie', 'lat' => $v['lat'], 'lng' => $v['lng']])
            ->values();

        $base = rtrim((string) config('assistant.nominatim_url'), '/');
        $distants = $base === '' || mb_strlen($texte) < 3 ? [] : Cache::remember('lieux:'.md5(mb_strtolower($texte)), now()->addDay(), function () use ($base, $texte) {
            try {
                $r = Http::timeout(6)->withHeaders(['User-Agent' => 'Volteo/1.0 (application de recharge)'])
                    ->get("{$base}/search", ['q' => $texte, 'countrycodes' => 'tn', 'format' => 'jsonv2', 'limit' => 6, 'accept-language' => 'fr']);

                return collect($r->successful() ? $r->json() : [])->map(fn ($l) => [
                    'nom' => $l['name'] ?: strtok($l['display_name'], ','),
                    'detail' => implode(', ', array_slice(array_map('trim', explode(',', $l['display_name'])), 1, 2)),
                    'lat' => (float) $l['lat'],
                    'lng' => (float) $l['lon'],
                ])->all();
            } catch (\Throwable) {
                return [];
            }
        });

        return $locales->concat($distants)->unique(fn ($l) => round($l['lat'], 2).','.round($l['lng'], 2))->take(8)->values()->all();
    }

    /**
     * Nom d'un point touché sur la carte (adresse, lieu ou quartier), via Nominatim.
     *
     * @return array{nom: string, detail: string, lat: float, lng: float}
     */
    public function lieuAuPoint(float $lat, float $lng): array
    {
        $repli = ['nom' => 'Point sur la carte', 'detail' => sprintf('%.5f, %.5f', $lat, $lng), 'lat' => $lat, 'lng' => $lng];
        $base = rtrim((string) config('assistant.nominatim_url'), '/');
        if ($base === '') {
            return $repli;
        }

        return Cache::remember('lieu-inverse:'.round($lat, 4).','.round($lng, 4), now()->addDay(), function () use ($base, $lat, $lng, $repli) {
            try {
                $r = Http::timeout(6)->withHeaders(['User-Agent' => 'Volteo/1.0 (application de recharge)'])
                    ->get("{$base}/reverse", ['lat' => $lat, 'lon' => $lng, 'format' => 'jsonv2', 'zoom' => 17, 'accept-language' => 'fr']);
                $l = $r->successful() ? $r->json() : null;
                if (! $l || isset($l['error'])) {
                    return $repli;
                }
                $a = $l['address'] ?? [];
                $rue = trim(($a['house_number'] ?? '').' '.($a['road'] ?? ''));
                $nom = $l['name'] ?: ($rue ?: ($a['suburb'] ?? $a['village'] ?? $a['town'] ?? $a['city'] ?? $repli['nom']));
                $ville = $a['city'] ?? $a['town'] ?? $a['village'] ?? $a['state'] ?? '';

                return ['nom' => $nom, 'detail' => implode(', ', array_filter([$a['suburb'] ?? null, $ville])), 'lat' => $lat, 'lng' => $lng];
            } catch (\Throwable) {
                return $repli;
            }
        });
    }

    private function sansAccents(string $t): string
    {
        return strtr($t, ['é' => 'e', 'è' => 'e', 'ê' => 'e', 'à' => 'a', 'â' => 'a', 'î' => 'i', 'ô' => 'o', 'û' => 'u', 'ç' => 'c', 'É' => 'E']);
    }

    /** Point d'une ville du catalogue (raccourcis de l'accueil). */
    public static function ville(string $cle): array
    {
        $v = self::VILLES[$cle];

        return ['nom' => $v['nom'], 'lat' => $v['lat'], 'lng' => $v['lng']];
    }

    /** Commentaire rédigé par l'IA (mis en cache), ou calculé si le modèle est indisponible. */
    private function commenter(array $plan): array
    {
        $calcule = $this->commentaireCalcule($plan);
        if ($this->modele instanceof ModeleNonConfigure) {
            return ['commentaire' => $calcule, 'source' => 'calcul'];
        }

        return Cache::remember('trajet:'.md5(json_encode(array_diff_key($plan, ['trace' => 0, 'instructions' => 0]))), now()->addHours(6), function () use ($plan, $calcule) {
            $system = [[
                'type' => 'text',
                'text' => "Tu es Volta, l'assistant de l'application de recharge Volteo (Tunisie, prix en DT). "
                    .'On te donne un trajet en voiture électrique déjà calculé (étapes, batterie, temps, coût). '
                    .'Écris un commentaire de copilote enthousiaste et concret en 2 phrases maximum (260 caractères max), '
                    ."en vouvoyant : mets en avant un point utile (pause conseillée, économie face à l'essence, arrivée confortable…). "
                    ."N'invente aucun chiffre ni aucune borne. Si le trajet est impossible, explique-le avec tact et propose de recharger avant de partir. "
                    .'Réponds uniquement avec un objet JSON : {"commentaire": "…"}.',
            ]];

            try {
                // Le tracé et les coordonnées n'apportent rien au commentaire : ils ne sont pas envoyés.
                $resume = [...$plan, 'trace' => null, 'instructions' => null, 'etapes' => array_map(fn ($e) => array_diff_key($e, ['lat' => 0, 'lng' => 0]), $plan['etapes'])];
                $reponse = $this->modele->repondre($system, [['role' => 'user', 'content' => json_encode($resume, JSON_UNESCAPED_UNICODE)]], []);
                $texte = collect($reponse['content'] ?? [])->where('type', 'text')->pluck('text')->join('');
                if (preg_match('/\{.*\}/s', $texte, $m) && is_string($c = json_decode($m[0], true)['commentaire'] ?? null) && trim($c) !== '') {
                    return ['commentaire' => mb_substr(trim($c), 0, 320), 'source' => 'ia'];
                }
            } catch (AssistantIndisponible|HistoriqueIncompatible $e) {
                Log::info('Trajet Volta : commentaire IA indisponible', ['message' => $e->getMessage()]);
            }

            return ['commentaire' => $calcule, 'source' => 'calcul'];
        });
    }

    private function commentaireCalcule(array $plan): string
    {
        if (! $plan['possible']) {
            return "Avec votre batterie actuelle, aucune borne Volteo ne permet d’atteindre {$plan['bloqueA']}. Rechargez à 80 % avant de partir, puis relancez le calcul.";
        }
        $arrets = count(array_filter($plan['etapes'], fn ($e) => $e['type'] === 'recharge'));
        $arrivee = end($plan['etapes'])['batterie'];
        $economie = max(0, $plan['coutEssenceDt'] - $plan['coutDt']);

        return ($arrets === 0
            ? "Trajet direct : vous arriverez à {$plan['arrivee']} avec {$arrivee} % de batterie."
            : "{$arrets} pause".($arrets > 1 ? 's' : '')." recharge et vous arrivez à {$plan['arrivee']} avec {$arrivee} %.")
            .($economie > 1 ? ' Environ '.number_format($economie, 0, ',', ' ').' DT économisés par rapport à l’essence.' : '');
    }

    /** Puissance utilisable par le véhicule sur cette borne (0 si aucune prise compatible). */
    private function puissancePour(Borne $borne, string $prise): int
    {
        $types = $borne->connecteurs->pluck('type')->all();
        if (in_array($prise, $types, true) && in_array($prise, ['CCS', 'CHAdeMO', 'DC'], true)) {
            return (int) $borne->puissance_kw;
        }
        // Toute voiture électrique récente accepte la recharge AC en Type 2.
        if (array_intersect($types, ['Type2', 'AC'])) {
            return (int) min($borne->puissance_kw, self::PUISSANCE_AC_MAX);
        }

        return 0;
    }

    private function point(Borne $borne): array
    {
        return ['lat' => (float) $borne->latitude, 'lng' => (float) $borne->longitude];
    }

    /** Distance routière estimée (km). */
    private function route(array $a, array $b): float
    {
        $r = 6371;
        $dLat = deg2rad($b['lat'] - $a['lat']);
        $dLng = deg2rad($b['lng'] - $a['lng']);
        $h = sin($dLat / 2) ** 2 + cos(deg2rad($a['lat'])) * cos(deg2rad($b['lat'])) * sin($dLng / 2) ** 2;

        return 2 * $r * asin(min(1, sqrt($h))) * self::FACTEUR_ROUTE;
    }
}
