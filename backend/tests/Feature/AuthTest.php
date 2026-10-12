<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function creerClient(array $attributs = []): User
{
    return User::create(array_merge([
        'name' => 'Test Client',
        'nom' => 'Client',
        'prenom' => 'Test',
        'email' => 'client@test.tn',
        'password' => 'password',
        'role' => 'client',
        'solde_wallet' => 100,
    ], $attributs));
}

it('inscrit un nouveau client et retourne un token', function () {
    $reponse = $this->postJson('/api/v1/auth/register', [
        'nom' => 'Rzeigui',
        'prenom' => 'Maram',
        'email' => 'nouveau@test.tn',
        'password' => 'secret123',
    ]);

    $reponse->assertCreated()
        ->assertJsonStructure(['token', 'user' => ['id', 'nom', 'prenom', 'email', 'role', 'soldeWallet']])
        ->assertJsonPath('user.role', 'client');
});

it('connecte un utilisateur avec les bons identifiants', function () {
    creerClient();

    $this->postJson('/api/v1/auth/login', [
        'email' => 'client@test.tn',
        'password' => 'password',
    ])->assertOk()->assertJsonStructure(['token', 'user']);
});

it('refuse un mauvais mot de passe', function () {
    creerClient();

    $this->postJson('/api/v1/auth/login', [
        'email' => 'client@test.tn',
        'password' => 'mauvais',
    ])->assertUnprocessable();
});

it('exige un code 2FA quand la double authentification est activée', function () {
    creerClient()->forceFill(['two_factor_enabled' => true])->save();

    $this->postJson('/api/v1/auth/login', [
        'email' => 'client@test.tn',
        'password' => 'password',
    ])->assertOk()->assertJson(['twoFactor' => true])->assertJsonMissing(['token']);
});

it('réinitialise le mot de passe avec un code valide', function () {
    $user = creerClient();

    $this->postJson('/api/v1/auth/forgot', ['email' => 'client@test.tn'])->assertOk();

    // Le code est haché en base : on en force un connu pour le test.
    $user->forceFill([
        'reset_code' => Illuminate\Support\Facades\Hash::make('123456'),
        'reset_code_expires_at' => now()->addMinutes(10),
    ])->save();

    $this->postJson('/api/v1/auth/reset', [
        'email' => 'client@test.tn',
        'code' => '123456',
        'password' => 'nouveau-mdp',
    ])->assertOk();

    $this->postJson('/api/v1/auth/login', [
        'email' => 'client@test.tn',
        'password' => 'nouveau-mdp',
    ])->assertOk();
});

it('bloque les routes protégées sans token', function () {
    $this->getJson('/api/v1/bornes')->assertUnauthorized();
    $this->getJson('/api/v1/sessions')->assertUnauthorized();
    $this->getJson('/api/v1/admin/stats')->assertUnauthorized();
});
