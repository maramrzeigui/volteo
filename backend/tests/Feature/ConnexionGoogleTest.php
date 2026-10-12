<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    config(['services.google.client_ids' => ['client-ios.apps.googleusercontent.com']]);
});

function jetonGoogle(array $surcharges = []): void
{
    Http::fake(['oauth2.googleapis.com/*' => Http::response(array_merge([
        'aud' => 'client-ios.apps.googleusercontent.com',
        'iss' => 'https://accounts.google.com',
        'exp' => (string) (time() + 600),
        'sub' => '1122334455',
        'email' => 'Sami.Ben@gmail.com',
        'email_verified' => 'true',
        'given_name' => 'Sami',
        'family_name' => 'Ben Ali',
        'picture' => 'https://lh3.googleusercontent.com/a/photo',
    ], $surcharges))]);
}

it('crée un compte client au premier passage avec la photo Google', function () {
    jetonGoogle();

    $this->postJson('/api/v1/auth/google', ['id_token' => 'jeton'])
        ->assertCreated()
        ->assertJsonPath('user.email', 'sami.ben@gmail.com')
        ->assertJsonPath('user.prenom', 'Sami')
        ->assertJsonPath('user.photoUrl', 'https://lh3.googleusercontent.com/a/photo')
        ->assertJsonPath('user.compteGoogle', true)
        ->assertJsonStructure(['token']);

    expect(User::where('email', 'sami.ben@gmail.com')->value('role'))->toBe('client');
});

it('relie un compte client existant de même email', function () {
    $client = User::factory()->create(['email' => 'sami.ben@gmail.com', 'role' => 'client']);
    jetonGoogle();

    $this->postJson('/api/v1/auth/google', ['id_token' => 'jeton'])->assertOk()->assertJsonPath('user.id', $client->id);
    expect($client->fresh()->google_id)->toBe('1122334455');
});

it('refuse un jeton émis pour une autre application', function () {
    jetonGoogle(['aud' => 'autre-app.apps.googleusercontent.com']);
    $this->postJson('/api/v1/auth/google', ['id_token' => 'jeton'])->assertUnprocessable()->assertJsonValidationErrors('google');
    expect(User::count())->toBe(0);
});

it('refuse un email non vérifié ou un jeton expiré', function (array $surcharge) {
    jetonGoogle($surcharge);
    $this->postJson('/api/v1/auth/google', ['id_token' => 'jeton'])->assertUnprocessable();
})->with([
    'email non vérifié' => [['email_verified' => 'false']],
    'jeton expiré' => [['exp' => (string) (time() - 5)]],
]);

it('refuse le personnel, qui garde mot de passe et double authentification', function () {
    User::factory()->create(['email' => 'sami.ben@gmail.com', 'role' => 'exploitant']);
    jetonGoogle();
    $this->postJson('/api/v1/auth/google', ['id_token' => 'jeton'])->assertUnprocessable()->assertJsonValidationErrors('google');
});

it('refuse un compte désactivé', function () {
    User::factory()->create(['email' => 'sami.ben@gmail.com', 'role' => 'client', 'actif' => false]);
    jetonGoogle();
    $this->postJson('/api/v1/auth/google', ['id_token' => 'jeton'])->assertUnprocessable();
});

it('indique clairement quand Google n’est pas configuré', function () {
    config(['services.google.client_ids' => []]);
    $this->postJson('/api/v1/auth/google', ['id_token' => 'jeton'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.google.0', 'La connexion Google n’est pas configurée sur ce serveur.');
});
