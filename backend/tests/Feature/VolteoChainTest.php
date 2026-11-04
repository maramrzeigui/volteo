<?php

use App\Models\Batterie;
use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\SessionRecharge;
use App\Models\Station;
use App\Models\User;
use App\Models\Vehicule;
use App\Services\CertificationRecharges;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as RequeteHttp;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['services.blockchain.url' => 'http://pont.test', 'services.blockchain.secret' => 'secret-test']);
});

function chainFabricant(): User
{
    return User::create(['name' => 'Renault Batteries', 'nom' => 'Batteries', 'prenom' => 'Renault', 'email' => 'fab@test.tn', 'password' => 'password', 'role' => 'fabricant']);
}

function chainPontOk(): void
{
    Http::fake([
        'pont.test/portefeuilles' => Http::response(['adresse' => '0xabc']),
        'pont.test/batteries/transfert' => Http::response(['tx' => '0xtransfert', 'proprietaire' => '0xdef']),
        'pont.test/batteries' => Http::response(['tokenId' => 7, 'tx' => '0xcreation']),
        'pont.test/recharges' => Http::response(['tx' => '0xrecharge']),
        'pont.test/batteries/*' => Http::response(['tokenId' => 7, 'numSerie' => 'BAT-001', 'recharges' => []]),
    ]);
}

function chainBatterieCreee(User $fabricant): Batterie
{
    return Batterie::create([
        'fabricant_id' => $fabricant->id, 'num_serie' => 'BAT-001', 'modele' => 'Renault Megane E-Tech', 'chimie' => 'NMC',
        'capacite_kwh' => 60, 'vin' => 'VF1RCB00012345678', 'statut' => 'creee', 'token_id' => 7, 'code_activation' => 'K7M2-9QX4',
    ]);
}

it('crée le NFT de la batterie quand le fabricant l’enregistre', function () {
    chainPontOk();
    Sanctum::actingAs(chainFabricant());

    $r = $this->postJson('/api/v1/fabricant/batteries', [
        'numSerie' => 'bat-001', 'modele' => 'Renault Megane E-Tech', 'chimie' => 'NMC', 'capaciteKwh' => 60, 'vin' => 'VF1RCB00012345678',
    ])->assertCreated();

    expect($r->json('statut'))->toBe('creee')
        ->and($r->json('tokenId'))->toBe(7)
        ->and($r->json('numSerie'))->toBe('BAT-001')
        ->and($r->json('codeActivation'))->toMatch('/^[A-Z2-9]{4}-[A-Z2-9]{4}$/');
    Http::assertSent(fn (RequeteHttp $req) => $req->url() === 'http://pont.test/batteries'
        && $req['fabricant'] === 'fabricant:'.auth()->id() && $req->header('X-Pont-Secret')[0] === 'secret-test');
});

it('garde la batterie en échec si le pont blockchain est indisponible', function () {
    Http::fake(['pont.test/*' => Http::response(['message' => 'Pont arrêté'], 503)]);
    Sanctum::actingAs(chainFabricant());

    $this->postJson('/api/v1/fabricant/batteries', ['numSerie' => 'BAT-002', 'modele' => 'Zoe', 'capaciteKwh' => 52])
        ->assertCreated()
        ->assertJsonPath('statut', 'echec');
});

it('réserve l’espace fabricant aux fabricants', function () {
    Sanctum::actingAs(User::factory()->create(['role' => 'client']));
    $this->getJson('/api/v1/fabricant/batteries')->assertForbidden();
});

it('active la batterie du client avec le bon code et lui transfère le NFT', function () {
    chainPontOk();
    $fabricant = chainFabricant();
    $batterie = chainBatterieCreee($fabricant);
    $client = User::factory()->create(['role' => 'client']);
    $vehicule = Vehicule::create(['user_id' => $client->id, 'marque' => 'Renault', 'modele' => 'Megane', 'immatriculation' => '200 TU 1234', 'type_connecteur' => 'CCS', 'capacite_batterie_kwh' => 60]);
    Sanctum::actingAs($client);

    $this->postJson('/api/v1/batteries/activer', ['numSerie' => 'http://localhost:5173/batterie/BAT-001', 'code' => 'XXXX-XXXX', 'vehiculeId' => $vehicule->id])
        ->assertStatus(422);
    $this->postJson('/api/v1/batteries/activer', ['numSerie' => 'http://localhost:5173/batterie/BAT-001', 'code' => 'k7m29qx4', 'vehiculeId' => $vehicule->id])
        ->assertOk()
        ->assertJsonPath('data.statut', 'activee');

    expect($batterie->fresh())->proprietaire_id->toBe($client->id)->vehicule_id->toBe($vehicule->id);
    Http::assertSent(fn (RequeteHttp $req) => $req->url() === 'http://pont.test/batteries/transfert'
        && $req['de'] === 'fabricant:'.$fabricant->id && $req['vers'] === 'user:'.$client->id);
});

it('certifie la recharge d’un véhicule à batterie certifiée, signée par sa station', function () {
    chainPontOk();
    $batterie = chainBatterieCreee(chainFabricant());
    $client = User::factory()->create(['role' => 'client']);
    $vehicule = Vehicule::create(['user_id' => $client->id, 'marque' => 'Renault', 'modele' => 'Megane', 'immatriculation' => '200 TU 1', 'type_connecteur' => 'CCS', 'capacite_batterie_kwh' => 60]);
    $batterie->update(['statut' => 'activee', 'proprietaire_id' => $client->id, 'vehicule_id' => $vehicule->id]);
    $station = Station::create(['nom' => 'Lac Energie', 'commission_pct' => 10]);
    $borne = Borne::create([
        'nom' => 'Borne Lac', 'reference' => 'BRN-LAC-001', 'adresse' => 'Lac', 'latitude' => 36.8, 'longitude' => 10.2, 'version_ocpp' => '1.6',
        'puissance_kw' => 22, 'etat' => 'disponible', 'tarif_kwh' => 0.5, 'source' => 'reseau', 'station_id' => $station->id,
    ]);
    $prise = Connecteur::create(['borne_id' => $borne->id, 'type' => 'Type2', 'puissance_kw' => 22, 'etat' => 'disponible']);
    $session = SessionRecharge::create([
        'user_id' => $client->id, 'borne_id' => $borne->id, 'connecteur_id' => $prise->id, 'vehicule_id' => $vehicule->id,
        'etat' => 'terminee', 'date_debut' => now()->subHour(), 'date_fin' => now(), 'energie_kwh' => 18.5, 'prix' => 9,
    ]);

    app(CertificationRecharges::class)->certifier($session);

    expect($session->fresh())->blockchain_statut->toBe('certifiee')->blockchain_tx->toBe('0xrecharge');
    Http::assertSent(fn (RequeteHttp $req) => $req->url() === 'http://pont.test/recharges'
        && $req['station'] === 'station:'.$station->id && $req['energieWh'] === 18500
        && $req['puissanceMaxW'] === 22000 && $req['sessionId'] === 'volteo-'.$session->id);
});

it('marque refusée une recharge rejetée par le smart contract', function () {
    Http::fake([
        'pont.test/portefeuilles' => Http::response(['adresse' => '0xabc']),
        'pont.test/recharges' => Http::response(['message' => 'Energie impossible pour cette borne'], 422),
    ]);
    $batterie = chainBatterieCreee(chainFabricant());
    $client = User::factory()->create(['role' => 'client']);
    $vehicule = Vehicule::create(['user_id' => $client->id, 'marque' => 'R', 'modele' => 'M', 'immatriculation' => 'X', 'type_connecteur' => 'CCS', 'capacite_batterie_kwh' => 60]);
    $batterie->update(['statut' => 'activee', 'proprietaire_id' => $client->id, 'vehicule_id' => $vehicule->id]);
    $borne = Borne::create([
        'nom' => 'B', 'reference' => 'BRN-X', 'adresse' => 'X', 'latitude' => 36.8, 'longitude' => 10.2, 'version_ocpp' => '1.6',
        'puissance_kw' => 22, 'etat' => 'disponible', 'tarif_kwh' => 0.5, 'source' => 'reseau',
    ]);
    $prise = Connecteur::create(['borne_id' => $borne->id, 'type' => 'Type2', 'puissance_kw' => 22, 'etat' => 'disponible']);
    $session = SessionRecharge::create([
        'user_id' => $client->id, 'borne_id' => $borne->id, 'connecteur_id' => $prise->id, 'vehicule_id' => $vehicule->id,
        'etat' => 'terminee', 'date_debut' => now()->subMinutes(5), 'date_fin' => now(), 'energie_kwh' => 40, 'prix' => 20,
    ]);

    app(CertificationRecharges::class)->certifier($session);

    expect($session->fresh())->blockchain_statut->toBe('refusee')->blockchain_erreur->toBe('Energie impossible pour cette borne');
});

it('n’autorise que le super-admin à créer un compte fabricant', function () {
    $station = Station::create(['nom' => 'Sahel', 'commission_pct' => 10]);
    $exploitant = User::create(['name' => 'Ex', 'nom' => 'Ex', 'prenom' => 'P', 'email' => 'ex@test.tn', 'password' => 'password', 'role' => 'exploitant', 'station_id' => $station->id]);
    Sanctum::actingAs($exploitant);

    $this->postJson('/api/v1/admin/users', ['nom' => 'F', 'prenom' => 'F', 'email' => 'f@test.tn', 'role' => 'fabricant'])
        ->assertStatus(422);
});
