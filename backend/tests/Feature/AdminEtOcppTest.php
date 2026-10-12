<?php

use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\SessionRecharge;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

function borneTest(): Borne
{
    $borne = Borne::create([
        'nom' => 'Borne Admin', 'reference' => 'BRN-ADM-001', 'numero_serie' => 'SN-ADM',
        'modele' => 'Test', 'fabricant' => 'Test', 'adresse' => 'Tunis',
        'latitude' => 36.8, 'longitude' => 10.18, 'version_firmware' => '1.0',
        'version_ocpp' => '1.6', 'puissance_kw' => 22, 'etat' => 'disponible', 'tarif_kwh' => 0.5,
    ]);
    Connecteur::create(['borne_id' => $borne->id, 'type' => 'Type2', 'puissance_kw' => 22, 'etat' => 'disponible']);

    return $borne;
}

function connecterAvecRole(string $role): User
{
    $user = User::create([
        'name' => "U $role", 'nom' => $role, 'prenom' => 'Test',
        'email' => "$role@test.tn", 'password' => 'password', 'role' => $role,
    ]);
    Sanctum::actingAs($user);

    return $user;
}

it('interdit le back-office aux clients (RBAC)', function () {
    connecterAvecRole('client');

    $this->getJson('/api/v1/admin/stats')->assertForbidden();
    $this->getJson('/api/v1/admin/bornes')->assertForbidden();
    $this->getJson('/api/v1/admin/audit')->assertForbidden();
});

it('autorise le back-office aux exploitants', function () {
    borneTest();
    connecterAvecRole('exploitant');

    $this->getJson('/api/v1/admin/stats')->assertOk()->assertJsonStructure([
        'bornesTotal', 'bornesActives', 'bornesIndisponibles', 'sessionsAujourdhui',
        'caTotal', 'caAujourdhui', 'kwhTotal', 'tempsMoyenMinutes',
    ]);
    $this->getJson('/api/v1/admin/bornes')->assertOk()->assertJsonCount(1);
});

it('crée une borne avec ses connecteurs depuis le back-office', function () {
    connecterAvecRole('super_admin');

    $this->postJson('/api/v1/admin/bornes', [
        'nom' => 'Nouvelle borne',
        'reference' => 'BRN-NEW-001',
        'numeroSerie' => 'SN-NEW',
        'modele' => 'Terra',
        'fabricant' => 'ABB',
        'adresse' => 'Sfax',
        'latitude' => 34.74,
        'longitude' => 10.76,
        'versionFirmware' => '1.0',
        'versionOcpp' => '2.0.1',
        'puissanceKw' => 50,
        'tarifKwh' => 0.6,
        'connecteurs' => [
            ['type' => 'CCS', 'puissanceKw' => 50],
            ['type' => 'Type2', 'puissanceKw' => 22],
        ],
    ])->assertCreated()->assertJsonPath('reference', 'BRN-NEW-001')->assertJsonCount(2, 'connecteurs');

    $this->assertDatabaseHas('audit_logs', ['action' => 'creation']);
});

it('rejette les événements OCPP sans secret partagé', function () {
    $this->postJson('/api/v1/internal/ocpp/heartbeat', ['reference' => 'X'])->assertUnauthorized();
});

it('met à jour la session avec les MeterValues OCPP', function () {
    $borne = borneTest();
    $user = connecterAvecRole('client');
    $user->update(['solde_wallet' => 50]);

    $session = SessionRecharge::create([
        'user_id' => $user->id,
        'borne_id' => $borne->id,
        'connecteur_id' => $borne->connecteurs()->value('id'),
        'date_debut' => now(),
        'energie_kwh' => 0,
        'prix' => 0,
        'etat' => 'en_cours',
    ]);

    $this->postJson('/api/v1/internal/ocpp/meter-values', [
        'reference' => $borne->reference,
        'sessionId' => $session->id,
        'energieKwh' => 12.5,
        'puissanceKw' => 48.2,
        'pourcentageBatterie' => 63,
    ], ['X-Ocpp-Secret' => config('services.ocpp.secret')])->assertOk();

    $session->refresh();
    expect($session->energie_kwh)->toBe(12.5)
        ->and($session->prix)->toBe(6.25) // 12,5 kWh × 0,50
        ->and($session->pourcentage_batterie)->toBe(63);
});

it('marque la borne déconnectée après 5 minutes sans heartbeat', function () {
    $borne = borneTest();
    $borne->update(['dernier_heartbeat' => now()->subMinutes(10)]);

    $this->artisan('bornes:verifier-heartbeats')->assertSuccessful();

    expect($borne->fresh()->etat)->toBe('deconnectee');
    $this->assertDatabaseHas('alertes', ['borne_id' => $borne->id, 'type' => 'borne_deconnectee']);
});

it('exclut les bornes publiques de la supervision admin', function () {
    borneTest();
    Borne::create([
        'source' => 'publique', 'source_id' => 'osm:node/1', 'reference' => 'PUB-OSM-N1',
        'nom' => 'Borne Shell', 'operateur' => 'Shell', 'adresse' => 'Tunis',
        'latitude' => 36.7, 'longitude' => 10.1, 'etat' => 'inconnu',
    ]);
    connecterAvecRole('exploitant');

    $this->getJson('/api/v1/admin/bornes')->assertOk()->assertJsonCount(1);
    $this->getJson('/api/v1/admin/stats')->assertJsonPath('bornesTotal', 1);
    $this->getJson('/api/v1/bornes')->assertOk()->assertJsonCount(2);
});
