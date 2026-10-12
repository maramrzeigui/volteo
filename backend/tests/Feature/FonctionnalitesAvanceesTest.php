<?php

use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\Reservation;
use App\Models\SessionRecharge;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

function prise(): Connecteur
{
    $borne = Borne::create([
        'nom' => 'Borne Avancée', 'reference' => 'BRN-AV-001', 'numero_serie' => 'SN-AV',
        'modele' => 'X', 'fabricant' => 'Y', 'adresse' => 'Tunis', 'latitude' => 36.8, 'longitude' => 10.1,
        'version_firmware' => '1', 'version_ocpp' => '1.6', 'puissance_kw' => 60, 'etat' => 'disponible',
        'tarif_kwh' => 0.6,
    ]);

    return Connecteur::create(['borne_id' => $borne->id, 'type' => 'CCS', 'puissance_kw' => 60, 'etat' => 'disponible']);
}

function client(string $email = 'av@test.tn'): User
{
    $user = User::create([
        'name' => 'Client', 'nom' => 'Av', 'prenom' => 'Client', 'email' => $email,
        'password' => 'password', 'role' => 'client', 'solde_wallet' => 50,
    ]);
    Sanctum::actingAs($user);

    return $user;
}

it('réserve une prise pendant 15 minutes et la bloque pour les autres', function () {
    $prise = prise();
    client();

    $this->postJson('/api/v1/reservations', ['connecteur_id' => $prise->id])
        ->assertCreated()
        ->assertJsonPath('connecteurId', $prise->id);

    expect($prise->fresh()->etat)->toBe('reserve');

    client('autre@test.tn');
    $this->postJson('/api/v1/sessions', ['borne_id' => $prise->borne_id, 'connecteur_id' => $prise->id])
        ->assertUnprocessable();
});

it('laisse l’auteur de la réservation démarrer sur sa prise', function () {
    $prise = prise();
    client();

    $this->postJson('/api/v1/reservations', ['connecteur_id' => $prise->id])->assertCreated();
    $this->postJson('/api/v1/sessions', ['borne_id' => $prise->borne_id, 'connecteur_id' => $prise->id])
        ->assertCreated();

    $this->assertDatabaseHas('reservations', ['connecteur_id' => $prise->id, 'statut' => 'utilisee']);
});

it('libère la prise quand la réservation expire', function () {
    $prise = prise();
    client();

    $this->postJson('/api/v1/reservations', ['connecteur_id' => $prise->id])->assertCreated();
    Reservation::query()->update(['expire_le' => now()->subMinute()]);

    $this->getJson('/api/v1/reservations/active')->assertOk();
    expect($prise->fresh()->etat)->toBe('disponible');
    $this->assertDatabaseHas('reservations', ['statut' => 'expiree']);
});

it('annule une réservation', function () {
    $prise = prise();
    client();

    $id = $this->postJson('/api/v1/reservations', ['connecteur_id' => $prise->id])->json('id');
    $this->deleteJson("/api/v1/reservations/{$id}")->assertOk();

    expect($prise->fresh()->etat)->toBe('disponible');
});

it('gère les bornes favorites', function () {
    $prise = prise();
    client();

    $this->postJson("/api/v1/favoris/{$prise->borne_id}")->assertCreated();
    $this->postJson("/api/v1/favoris/{$prise->borne_id}")->assertCreated();
    $this->getJson('/api/v1/favoris')->assertOk()->assertExactJson([$prise->borne_id]);

    $this->deleteJson("/api/v1/favoris/{$prise->borne_id}")->assertOk();
    $this->getJson('/api/v1/favoris')->assertExactJson([]);
});

it('enregistre la courbe de puissance envoyée par la borne', function () {
    $prise = prise();
    $user = client();
    $session = SessionRecharge::create([
        'user_id' => $user->id, 'borne_id' => $prise->borne_id, 'connecteur_id' => $prise->id,
        'date_debut' => now(), 'energie_kwh' => 0, 'prix' => 0, 'etat' => 'en_cours',
    ]);

    foreach ([[1.2, 55], [2.5, 57]] as [$kwh, $kw]) {
        $this->postJson('/api/v1/internal/ocpp/meter-values', [
            'reference' => $prise->borne->reference, 'sessionId' => $session->id, 'energieKwh' => $kwh, 'puissanceKw' => $kw,
        ], ['X-Ocpp-Secret' => config('services.ocpp.secret')])->assertOk();
    }

    $this->getJson("/api/v1/sessions/{$session->id}/mesures")
        ->assertOk()
        ->assertJsonCount(2)
        ->assertJsonPath('1.puissanceKw', 57);
});

it('fournit les statistiques des six derniers mois', function () {
    client();

    $this->getJson('/api/v1/stats/client')
        ->assertOk()
        ->assertJsonCount(6, 'parMois')
        ->assertJsonStructure(['parMois' => [['mois', 'kwh', 'prix', 'sessions']], 'kmAjoutes']);
});
