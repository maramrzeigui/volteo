<?php

use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

function creerBorneAvecConnecteur(): array
{
    $borne = Borne::create([
        'nom' => 'Borne Test',
        'reference' => 'BRN-TEST-001',
        'numero_serie' => 'SN-TEST',
        'modele' => 'Test',
        'fabricant' => 'Test',
        'adresse' => 'Tunis',
        'latitude' => 36.8,
        'longitude' => 10.18,
        'version_firmware' => '1.0',
        'version_ocpp' => '1.6',
        'puissance_kw' => 22,
        'etat' => 'disponible',
        'tarif_kwh' => 0.5,
    ]);

    $connecteur = Connecteur::create([
        'borne_id' => $borne->id,
        'type' => 'Type2',
        'puissance_kw' => 22,
        'etat' => 'disponible',
    ]);

    return [$borne, $connecteur];
}

function clientConnecte(float $solde = 100): User
{
    $user = User::create([
        'name' => 'Client Session',
        'nom' => 'Session',
        'prenom' => 'Client',
        'email' => 'session@test.tn',
        'password' => 'password',
        'role' => 'client',
        'solde_wallet' => $solde,
    ]);
    Sanctum::actingAs($user);

    return $user;
}

it('démarre une recharge et occupe le connecteur', function () {
    [$borne, $connecteur] = creerBorneAvecConnecteur();
    clientConnecte();

    $this->postJson('/api/v1/sessions', [
        'borne_id' => $borne->id,
        'connecteur_id' => $connecteur->id,
    ])->assertCreated()
        ->assertJsonPath('etat', 'en_cours')
        ->assertJsonPath('energieKwh', 0);

    expect($connecteur->fresh()->etat)->toBe('occupe')
        ->and($borne->fresh()->etat)->toBe('occupee');
});

it('refuse une deuxième recharge simultanée', function () {
    [$borne, $connecteur] = creerBorneAvecConnecteur();
    clientConnecte();

    $this->postJson('/api/v1/sessions', [
        'borne_id' => $borne->id,
        'connecteur_id' => $connecteur->id,
    ])->assertCreated();

    $this->postJson('/api/v1/sessions', [
        'borne_id' => $borne->id,
        'connecteur_id' => $connecteur->id,
    ])->assertUnprocessable();
});

it("arrête la recharge, facture et débite le wallet", function () {
    [$borne, $connecteur] = creerBorneAvecConnecteur();
    $user = clientConnecte(solde: 100);

    $id = $this->postJson('/api/v1/sessions', [
        'borne_id' => $borne->id,
        'connecteur_id' => $connecteur->id,
    ])->json('id');

    // Simule la télémétrie OCPP : 10 kWh consommés.
    \App\Models\SessionRecharge::find($id)->update(['energie_kwh' => 10]);

    $this->postJson("/api/v1/sessions/{$id}/stop")
        ->assertOk()
        ->assertJsonPath('etat', 'terminee')
        ->assertJsonPath('prix', 5); // 10 kWh × 0,50

    expect((float) $user->fresh()->solde_wallet)->toBe(95.0)
        ->and($connecteur->fresh()->etat)->toBe('disponible')
        ->and($borne->fresh()->etat)->toBe('disponible');

    $this->assertDatabaseHas('paiements', ['session_recharge_id' => $id, 'statut' => 'paye', 'methode' => 'wallet']);
    $this->assertDatabaseHas('factures', ['session_recharge_id' => $id, 'montant_ttc' => 5]);
});

it('plafonne la recharge au solde du wallet : jamais de paiement en attente', function () {
    [$borne, $connecteur] = creerBorneAvecConnecteur();
    $user = clientConnecte(solde: 10);

    $id = $this->postJson('/api/v1/sessions', [
        'borne_id' => $borne->id,
        'connecteur_id' => $connecteur->id,
    ])->json('id');
    $user->update(['solde_wallet' => 3]);

    \App\Models\SessionRecharge::find($id)->update(['energie_kwh' => 40]);
    $this->postJson("/api/v1/sessions/{$id}/stop")->assertOk()->assertJsonPath('arretSolde', true);

    expect((float) $user->fresh()->solde_wallet)->toBe(0.0)
        ->and((float) \App\Models\SessionRecharge::find($id)->prix)->toBe(3.0);
    $this->assertDatabaseHas('paiements', ['session_recharge_id' => $id, 'statut' => 'paye', 'montant' => 3]);
    $this->assertDatabaseMissing('paiements', ['statut' => 'en_attente']);
});

it('arrête la recharge quand le prix atteint le solde (MeterValues)', function () {
    [$borne, $connecteur] = creerBorneAvecConnecteur();
    $user = clientConnecte(solde: 10);
    $id = $this->postJson('/api/v1/sessions', ['borne_id' => $borne->id, 'connecteur_id' => $connecteur->id])->json('id');

    $this->postJson('/api/v1/internal/ocpp/meter-values', [
        'reference' => $borne->reference, 'sessionId' => $id, 'energieKwh' => 500, 'puissanceKw' => 22,
    ], ['X-Ocpp-Secret' => config('services.ocpp.secret')])->assertOk();

    $session = \App\Models\SessionRecharge::find($id);
    expect($session->etat)->toBe('terminee')
        ->and($session->arret_solde)->toBeTrue()
        ->and((float) $session->prix)->toBe(10.0)
        ->and((float) $user->fresh()->solde_wallet)->toBe(0.0);
});

it('recharge le wallet via topup', function () {
    $user = clientConnecte(solde: 10);

    $this->postJson('/api/v1/wallet/topup', ['montant' => 50])
        ->assertOk()
        ->assertJsonPath('soldeWallet', 60);

    $this->assertDatabaseHas('paiements', ['user_id' => $user->id, 'methode' => 'topup_carte', 'statut' => 'paye']);
});

it("interdit d'arrêter la session d'un autre client", function () {
    [$borne, $connecteur] = creerBorneAvecConnecteur();
    clientConnecte();

    $id = $this->postJson('/api/v1/sessions', [
        'borne_id' => $borne->id,
        'connecteur_id' => $connecteur->id,
    ])->json('id');

    $autre = User::create([
        'name' => 'Autre', 'nom' => 'Autre', 'prenom' => 'Client',
        'email' => 'autre@test.tn', 'password' => 'password', 'role' => 'client',
    ]);
    Sanctum::actingAs($autre);

    $this->postJson("/api/v1/sessions/{$id}/stop")->assertForbidden();
});

it('renvoie null quand aucune recharge n\'est en cours', function () {
    clientConnecte();

    $reponse = $this->getJson('/api/v1/sessions/active')->assertOk();

    expect($reponse->getContent())->toBe('null');
});

it('refuse de démarrer une recharge sur une borne publique', function () {
    [$borne, $connecteur] = creerBorneAvecConnecteur();
    $borne->update(['source' => 'publique']);
    clientConnecte();

    $this->postJson('/api/v1/sessions', [
        'borne_id' => $borne->id,
        'connecteur_id' => $connecteur->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('borne_id');
});

it('refuse de démarrer une recharge sous le solde minimum ou avec une recharge impayée', function () {
    [$borne, $connecteur] = creerBorneAvecConnecteur();
    $user = clientConnecte(solde: 0.5);

    $this->postJson('/api/v1/sessions', ['borne_id' => $borne->id, 'connecteur_id' => $connecteur->id])
        ->assertUnprocessable()->assertJsonValidationErrors('solde');

    $user->update(['solde_wallet' => 50]);
    \App\Models\Paiement::create(['user_id' => $user->id, 'montant' => 7.5, 'methode' => 'wallet', 'statut' => 'en_attente']);
    $this->postJson('/api/v1/sessions', ['borne_id' => $borne->id, 'connecteur_id' => $connecteur->id])
        ->assertUnprocessable()->assertJsonPath('errors.solde.0', fn ($m) => str_contains($m, 'impayée'));

    \App\Models\Paiement::where('user_id', $user->id)->update(['statut' => 'paye']);
    $this->postJson('/api/v1/sessions', ['borne_id' => $borne->id, 'connecteur_id' => $connecteur->id])->assertCreated();
});

it('refuse le badge à la borne quand le wallet est insuffisant', function () {
    [$borne] = creerBorneAvecConnecteur();
    $user = \App\Models\User::factory()->create(['role' => 'client', 'solde_wallet' => 0.5]);
    \App\Models\BadgeRfid::create(['uid' => 'PAUVRE-1', 'user_id' => $user->id]);
    $secret = ['X-Ocpp-Secret' => config('services.ocpp.secret')];

    $this->postJson('/api/v1/internal/ocpp/authorize', ['reference' => $borne->reference, 'idTag' => 'PAUVRE-1'], $secret)
        ->assertOk()->assertJsonPath('status', 'Blocked');
    $user->update(['solde_wallet' => 20]);
    $this->postJson('/api/v1/internal/ocpp/authorize', ['reference' => $borne->reference, 'idTag' => 'PAUVRE-1'], $secret)
        ->assertOk()->assertJsonPath('status', 'Accepted');
});
