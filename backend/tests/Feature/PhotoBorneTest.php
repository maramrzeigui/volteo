<?php

use App\Models\Borne;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

function borneAvecPhoto(): Borne
{
    return Borne::create([
        'nom' => 'Borne Photo', 'reference' => 'BRN-PH-'.uniqid(), 'adresse' => 'Sousse',
        'latitude' => 35.8, 'longitude' => 10.6, 'version_ocpp' => '1.6', 'puissance_kw' => 50,
        'etat' => 'disponible', 'tarif_kwh' => 0.6,
    ]);
}

function admin(string $role = 'super_admin'): User
{
    return User::create(['name' => 'A', 'nom' => 'A', 'prenom' => 'A', 'email' => uniqid().'@test.tn', 'password' => 'password', 'role' => $role]);
}

it('ajoute une photo à une borne, remplace l’ancienne et l’expose aux clients', function () {
    Storage::fake('public');
    $borne = borneAvecPhoto();
    Sanctum::actingAs(admin());

    $premiere = $this->post("/api/v1/admin/bornes/{$borne->id}/photo", ['photo' => UploadedFile::fake()->image('a.jpg', 1200, 800)], ['Accept' => 'application/json'])
        ->assertOk()->json('photoUrl');
    $this->post("/api/v1/admin/bornes/{$borne->id}/photo", ['photo' => UploadedFile::fake()->image('b.jpg', 1200, 800)], ['Accept' => 'application/json'])->assertOk();

    expect(Storage::disk('public')->exists(str_replace('/storage/', '', $premiere)))->toBeFalse()
        ->and(Storage::disk('public')->files('bornes'))->toHaveCount(1);

    Sanctum::actingAs(User::factory()->create(['role' => 'client']));
    expect($this->getJson("/api/v1/bornes/{$borne->id}")->json('photoUrl'))->toStartWith('/storage/bornes/');
});

it('refuse un fichier qui n’est pas une image ou trop petit', function () {
    Storage::fake('public');
    $borne = borneAvecPhoto();
    Sanctum::actingAs(admin());

    $this->post("/api/v1/admin/bornes/{$borne->id}/photo", ['photo' => UploadedFile::fake()->create('x.pdf', 100, 'application/pdf')], ['Accept' => 'application/json'])->assertUnprocessable();
    $this->post("/api/v1/admin/bornes/{$borne->id}/photo", ['photo' => UploadedFile::fake()->image('p.jpg', 100, 80)], ['Accept' => 'application/json'])->assertUnprocessable();
});

it('supprime la photo et interdit l’envoi aux clients', function () {
    Storage::fake('public');
    $borne = borneAvecPhoto();
    Sanctum::actingAs(admin());
    $this->post("/api/v1/admin/bornes/{$borne->id}/photo", ['photo' => UploadedFile::fake()->image('a.jpg', 800, 500)], ['Accept' => 'application/json']);

    $this->deleteJson("/api/v1/admin/bornes/{$borne->id}/photo")->assertOk()->assertJsonPath('photoUrl', null);
    expect(Storage::disk('public')->files('bornes'))->toBeEmpty();

    Sanctum::actingAs(User::factory()->create(['role' => 'client']));
    $this->post("/api/v1/admin/bornes/{$borne->id}/photo", ['photo' => UploadedFile::fake()->image('a.jpg', 800, 500)], ['Accept' => 'application/json'])->assertForbidden();
});
