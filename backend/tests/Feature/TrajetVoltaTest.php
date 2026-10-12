<?php

use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\User;
use App\Models\Vehicule;
use App\Services\Assistant\ModeleIA;
use App\Services\Assistant\ModeleNonConfigure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

function borneTrajet(string $nom, float $lat, float $lng, int $kw, string $type = 'CCS', string $etat = 'disponible'): Borne
{
    $b = Borne::create([
        'nom' => $nom, 'reference' => 'BRN-TR-'.uniqid(), 'adresse' => $nom, 'latitude' => $lat, 'longitude' => $lng,
        'version_ocpp' => '1.6', 'puissance_kw' => $kw, 'etat' => $etat, 'tarif_kwh' => 0.5, 'source' => 'reseau',
    ]);
    Connecteur::create(['borne_id' => $b->id, 'type' => $type, 'puissance_kw' => $kw, 'etat' => 'disponible']);

    return $b;
}

function conducteur(int $capacite = 60): User
{
    $u = User::factory()->create(['role' => 'client']);
    Vehicule::create(['user_id' => $u->id, 'marque' => 'Renault', 'modele' => 'Mégane E-Tech', 'immatriculation' => '1 TU '.rand(1000, 9999), 'type_connecteur' => 'CCS', 'capacite_batterie_kwh' => $capacite]);
    Sanctum::actingAs($u);

    return $u;
}

beforeEach(function () {
    app()->instance(ModeleIA::class, new ModeleNonConfigure);
    // Aucun appel aux services OpenStreetMap réels : sans réponse simulée, le routage
    // échoue et le planificateur se replie sur l'estimation à vol d'oiseau.
    Http::preventStrayRequests();
});

it('va directement à destination quand la batterie suffit', function () {
    conducteur();
    $r = $this->postJson('/api/v1/assistant/trajet', ['depart' => 'tunis', 'arrivee' => 'hammamet', 'batterie' => 80])->assertOk();

    expect($r->json('possible'))->toBeTrue()
        ->and($r->json('verdict'))->toBe('batterie_suffit')
        ->and(collect($r->json('etapes'))->pluck('type')->all())->toBe(['depart', 'arrivee'])
        ->and($r->json('etapes.1.batterie'))->toBeGreaterThan(10)
        ->and($r->json('coutEssenceDt'))->toBeGreaterThan(0);
});

it('ajoute un arrêt recharge sur une borne compatible du réseau quand il le faut', function () {
    conducteur(40);
    $sousse = borneTrajet('Borne Sousse', 35.8256, 10.6084, 100);
    borneTrajet('Borne en panne', 35.83, 10.60, 150, 'CCS', 'hors_service');
    borneTrajet('Borne CHAdeMO seule', 35.82, 10.61, 150, 'CHAdeMO');

    $r = $this->postJson('/api/v1/assistant/trajet', ['depart' => 'tunis', 'arrivee' => 'sfax', 'batterie' => 95])->assertOk();
    $arret = collect($r->json('etapes'))->firstWhere('type', 'recharge');

    expect($r->json('possible'))->toBeTrue()
        ->and($arret['borneId'])->toBe($sousse->id)
        ->and($arret['batterieDepart'])->toBeLessThanOrEqual(100)
        ->and($arret['batterieDepart'])->toBeGreaterThan($arret['batterieArrivee'])
        ->and($arret['minutes'])->toBeGreaterThan(0)
        ->and($arret['prix'])->toBeGreaterThan(0)
        ->and(collect($r->json('etapes'))->last()['batterie'])->toBeGreaterThanOrEqual(10);
});

it('signale un trajet impossible sans borne atteignable, avec un conseil', function () {
    conducteur(40);
    $r = $this->postJson('/api/v1/assistant/trajet', ['depart' => 'tunis', 'arrivee' => 'djerba', 'batterie' => 30])->assertOk();

    expect($r->json('possible'))->toBeFalse()
        ->and($r->json('source'))->toBe('calcul')
        ->and($r->json('commentaire'))->toContain('Rechargez');
});

it('fait commenter le trajet par l’IA sans consommer de question', function () {
    $u = conducteur();
    $faux = new FauxModeleIA([asTexte('{"commentaire": "Belle route côtière, arrivée confortable !"}')]);
    app()->instance(ModeleIA::class, $faux);

    $this->postJson('/api/v1/assistant/trajet', ['depart' => 'tunis', 'arrivee' => 'hammamet', 'batterie' => 80])
        ->assertOk()->assertJsonPath('source', 'ia')->assertJsonPath('commentaire', 'Belle route côtière, arrivée confortable !');

    expect($faux->requetes[0]['outils'])->toBe([]);
    $this->getJson('/api/v1/assistant/etat')->assertJsonPath('questionsRestantes', 10);
});

it('valide les villes et la batterie', function () {
    conducteur();
    $this->postJson('/api/v1/assistant/trajet', ['depart' => 'tunis', 'arrivee' => 'tunis'])->assertUnprocessable()->assertJsonValidationErrors('arrivee');
    $this->postJson('/api/v1/assistant/trajet', ['depart' => 'paris', 'arrivee' => 'sfax'])->assertUnprocessable();
    $this->postJson('/api/v1/assistant/trajet', ['depart' => ['nom' => 'Paris', 'lat' => 48.85, 'lng' => 2.35], 'arrivee' => 'sfax'])->assertUnprocessable();
    $this->postJson('/api/v1/assistant/trajet', ['depart' => 'tunis', 'arrivee' => 'sfax', 'batterie' => 0])->assertUnprocessable();
    $this->getJson('/api/v1/assistant/trajet/villes')->assertOk()->assertJsonFragment(['cle' => 'djerba', 'nom' => 'Djerba']);
});

it('recharge sur place avant de partir quand la première borne utile est hors de portée', function () {
    conducteur(60);
    $sfax = borneTrajet('Borne Sfax', 34.7406, 10.7603, 7, 'AC');
    $sousse = borneTrajet('Borne Sousse', 35.8256, 10.6084, 100);

    $r = $this->postJson('/api/v1/assistant/trajet', ['depart' => 'sfax', 'arrivee' => 'tunis', 'batterie' => 39])->assertOk();
    $arrets = collect($r->json('etapes'))->where('type', 'recharge')->values();

    expect($r->json('possible'))->toBeTrue()
        ->and($arrets[0]['borneId'])->toBe($sfax->id)
        ->and($arrets[0]['km'])->toBe(0)
        ->and($arrets[0]['puissanceKw'])->toBe(7)
        ->and($arrets[1]['borneId'])->toBe($sousse->id)
        // Sur la borne lente, juste de quoi rejoindre Sousse (100 kW), pas 100 %.
        ->and($arrets[0]['batterieDepart'])->toBeLessThan(80);
});

it('part de la position GPS du conducteur vers un lieu choisi', function () {
    conducteur();
    $r = $this->postJson('/api/v1/assistant/trajet', [
        'depart' => ['nom' => 'Ma position', 'lat' => 36.84, 'lng' => 10.23],
        'arrivee' => ['nom' => 'Port El Kantaoui', 'lat' => 35.89, 'lng' => 10.60],
        'batterie' => 90,
    ])->assertOk();

    expect($r->json('depart'))->toBe('Ma position')
        ->and($r->json('arrivee'))->toBe('Port El Kantaoui')
        ->and($r->json('etapes.0.lat'))->toBe(36.84)
        ->and($r->json('trace'))->not->toBeEmpty()
        ->and($r->json('routeReelle'))->toBeFalse();
});

it('passe par la borne choisie par le conducteur et y recharge juste assez', function () {
    conducteur(60);
    $hammamet = borneTrajet('Borne Hammamet', 36.3725, 10.539, 120);
    $r = $this->postJson('/api/v1/assistant/trajet', ['depart' => 'tunis', 'arrivee' => 'sousse', 'batterie' => 90, 'arrets' => [$hammamet->id]])->assertOk();
    $arret = collect($r->json('etapes'))->firstWhere('type', 'recharge');

    expect($arret['borneId'])->toBe($hammamet->id)
        ->and($arret['choisie'])->toBeTrue()
        ->and($r->json('verdict'))->toBe('recharge_necessaire')
        ->and($r->json('possible'))->toBeTrue();
});

it('utilise les distances routières réelles (OSRM) pour la batterie et le tracé', function () {
    conducteur();
    Http::fake(['router.project-osrm.org/*' => Http::response(['routes' => [[
        'distance' => 81000, 'duration' => 3600,
        'legs' => [['distance' => 81000, 'duration' => 3600, 'steps' => [
            ['name' => 'Avenue Habib Bourguiba', 'distance' => 400, 'maneuver' => ['type' => 'depart', 'location' => [10.18, 36.80]]],
            ['name' => 'Rue de Marseille', 'distance' => 900, 'maneuver' => ['type' => 'turn', 'modifier' => 'right', 'location' => [10.19, 36.80]]],
            ['name' => '', 'distance' => 1200, 'maneuver' => ['type' => 'roundabout', 'exit' => 2, 'location' => [10.20, 36.79]]],
            ['name' => '', 'distance' => 0, 'maneuver' => ['type' => 'arrive', 'location' => [10.61, 36.40]]],
        ]]],
        'geometry' => ['coordinates' => [[10.18, 36.80], [10.40, 36.55], [10.61, 36.40]]],
    ]]])]);

    $r = $this->postJson('/api/v1/assistant/trajet', ['depart' => 'tunis', 'arrivee' => 'hammamet', 'batterie' => 80])->assertOk();

    expect($r->json('routeReelle'))->toBeTrue()
        ->and($r->json('distanceKm'))->toBe(81)
        ->and($r->json('minutesConduite'))->toBe(60)
        ->and($r->json('trace'))->toBe([[36.8, 10.18], [36.55, 10.4], [36.4, 10.61]])
        ->and(collect($r->json('instructions'))->pluck('texte')->all())->toBe([
            'Partez par Avenue Habib Bourguiba',
            'Tournez à droite sur Rue de Marseille',
            'Au rond-point, prenez la 2e sortie',
            'Vous êtes arrivé à destination',
        ])
        ->and($r->json('instructions.1.icone'))->toBe('arrow-top-right');
});

it('recherche des lieux en Tunisie : villes du catalogue puis adresses OpenStreetMap', function () {
    conducteur();
    Http::fake(['nominatim.openstreetmap.org/*' => Http::response([
        ['name' => 'Port El Kantaoui', 'display_name' => 'Port El Kantaoui, Hammam Sousse, Sousse, Tunisie', 'lat' => '35.8917', 'lon' => '10.5986'],
    ])]);

    $this->getJson('/api/v1/assistant/lieux?q=sou')->assertOk()->assertJsonPath('0.nom', 'Sousse')->assertJsonPath('1.nom', 'Port El Kantaoui');
    $this->getJson('/api/v1/assistant/lieux?q=a')->assertUnprocessable();
});

it('nomme le point touché sur la carte, avec un repli si le service ne répond pas', function () {
    conducteur();
    Http::fake(['nominatim.openstreetmap.org/reverse*' => Http::response([
        'name' => 'Carrefour Market', 'address' => ['road' => 'Avenue de la Bourse', 'suburb' => 'Les Berges du Lac', 'city' => 'Tunis'],
    ])]);
    $this->getJson('/api/v1/assistant/lieux/point?lat=36.84&lng=10.24')
        ->assertOk()->assertJsonPath('nom', 'Carrefour Market')->assertJsonPath('detail', 'Les Berges du Lac, Tunis');

    // Hors Tunisie : refusé.
    $this->getJson('/api/v1/assistant/lieux/point?lat=48.85&lng=2.35')->assertUnprocessable();
});

it('donne les coordonnées quand le service de noms ne répond pas', function () {
    conducteur();
    Http::fake(['*' => Http::response([], 500)]);
    $this->getJson('/api/v1/assistant/lieux/point?lat=35.11&lng=10.11')->assertOk()->assertJsonPath('nom', 'Point sur la carte');
});
