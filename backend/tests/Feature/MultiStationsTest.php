<?php

use App\Models\Alerte;
use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\SessionRecharge;
use App\Models\Station;
use App\Models\Tarif;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

function stationAvecBorne(string $nom, float $commission = 10): array
{
    $station = Station::create(['nom' => $nom, 'commission_pct' => $commission]);
    $borne = Borne::create([
        'nom' => "Borne {$nom}", 'reference' => 'BRN-'.strtoupper(substr($nom, 0, 3)).'-'.uniqid(), 'adresse' => $nom,
        'latitude' => 36.8, 'longitude' => 10.18, 'version_ocpp' => '1.6', 'puissance_kw' => 22,
        'etat' => 'disponible', 'tarif_kwh' => 0.5, 'source' => 'reseau', 'station_id' => $station->id,
    ]);
    $prise = Connecteur::create(['borne_id' => $borne->id, 'type' => 'Type2', 'puissance_kw' => 22, 'etat' => 'disponible']);
    $admin = User::create(['name' => "Admin {$nom}", 'nom' => 'Admin', 'prenom' => $nom, 'email' => strtolower($nom).'@station.tn', 'password' => 'password', 'role' => 'exploitant', 'station_id' => $station->id]);

    return [$station, $borne, $prise, $admin];
}

function sessionTerminee(Borne $borne, Connecteur $prise, float $prix, ?string $date = null): SessionRecharge
{
    $client = User::factory()->create(['role' => 'client']);

    return SessionRecharge::create([
        'user_id' => $client->id, 'borne_id' => $borne->id, 'connecteur_id' => $prise->id, 'etat' => 'terminee',
        'date_debut' => $date ?? now()->startOfMonth()->addDay(), 'date_fin' => now(), 'energie_kwh' => 10, 'prix' => $prix,
    ]);
}

/** Liste d'une réponse, enveloppée ou non dans « data ». */
function liste($r): array
{
    return $r->json('data') ?? $r->json();
}

function superAdmin(): User
{
    return User::create(['name' => 'Super', 'nom' => 'Admin', 'prenom' => 'Super', 'email' => 'super@borneapp.tn', 'password' => 'password', 'role' => 'super_admin']);
}

it('donne à l’administrateur d’une station le back-office, limité aux données de sa station', function () {
    [$stationA, $borneA, $priseA, $adminA] = stationAvecBorne('Lac');
    [, $borneB, $priseB] = stationAvecBorne('Sahel');
    sessionTerminee($borneA, $priseA, 12);
    sessionTerminee($borneB, $priseB, 20);
    Alerte::create(['borne_id' => $borneB->id, 'type' => 'test', 'gravite' => 'warning', 'message' => 'Alerte Sahel']);
    Alerte::create(['borne_id' => $borneA->id, 'type' => 'test', 'gravite' => 'warning', 'message' => 'Alerte Lac']);

    Sanctum::actingAs($adminA);

    expect(collect(liste($this->getJson('/api/v1/admin/bornes')->assertOk()))->pluck('id')->all())->toBe([$borneA->id]);
    expect(collect(liste($this->getJson('/api/v1/admin/alertes')->assertOk()))->pluck('message')->all())->toBe(['Alerte Lac']);
    expect(collect(liste($this->getJson('/api/v1/admin/sessions')->assertOk()))->pluck('borneId')->unique()->values()->all())->toBe([$borneA->id]);
    $this->getJson("/api/v1/admin/bornes/{$borneB->id}")->assertNotFound();
    foreach (['users', 'tarifs', 'maintenances', 'audit'] as $page) {
        $this->getJson("/api/v1/admin/{$page}")->assertOk();
    }

    // Ses bornes sont modifiables ; celles d'une autre station restent hors d'atteinte.
    $this->putJson("/api/v1/admin/bornes/{$borneA->id}", ['nom' => 'Modifiée'])->assertOk();
    $this->putJson("/api/v1/admin/bornes/{$borneB->id}", ['nom' => 'Piratée'])->assertNotFound();
    expect($borneA->fresh()->nom)->toBe('Modifiée')->and($borneB->fresh()->nom)->toBe('Borne Sahel');
});

it('calcule le chiffre d’affaires, la commission et le net de la station', function () {
    [$station, $borne, $prise, $admin] = stationAvecBorne('Lac', commission: 12.5);
    sessionTerminee($borne, $prise, 40);
    sessionTerminee($borne, $prise, 60);
    Sanctum::actingAs($admin);

    $this->getJson('/api/v1/admin/ma-station')->assertOk()
        ->assertJsonPath('mois.chiffreAffaires', 100)
        ->assertJsonPath('mois.commission', 12.5)
        ->assertJsonPath('mois.net', 87.5)
        ->assertJsonPath('mois.sessions', 2);
});

it('réserve la console des stations au super-admin, qui crée une station et son administrateur', function () {
    [, , , $adminA] = stationAvecBorne('Lac');
    Sanctum::actingAs($adminA);
    $this->getJson('/api/v1/admin/stations')->assertForbidden();

    Sanctum::actingAs(superAdmin());
    $r = $this->postJson('/api/v1/admin/stations', [
        'nom' => 'Cap Bon Énergie', 'commissionPct' => 8, 'formule' => 'essentiel', 'bornesMax' => 5,
        'admin' => ['prenom' => 'Sami', 'nom' => 'Ben', 'email' => 'sami@capbon.tn'],
    ])->assertCreated();

    expect($r->json('acces.motDePasse'))->toHaveLength(14)
        ->and(User::where('email', 'sami@capbon.tn')->first())->role->toBe('exploitant')->station_id->toBe($r->json('id'));
    expect($this->getJson('/api/v1/admin/stations')->assertOk()->json('plateforme.stations'))->toBe(2);
});

it('suspend une station : bornes cachées aux conducteurs, recharge refusée, accès du personnel coupé', function () {
    [$station, $borne, , $admin] = stationAvecBorne('Lac');
    Sanctum::actingAs(superAdmin());
    $this->postJson("/api/v1/admin/stations/{$station->id}/suspendre", ['motif' => 'Facture impayée'])->assertOk();

    expect($borne->fresh()->accepteRecharge())->toBeFalse();

    Sanctum::actingAs(User::factory()->create(['role' => 'client']));
    expect(collect($this->getJson('/api/v1/bornes')->json())->pluck('id'))->not->toContain($borne->id);

    Sanctum::actingAs($admin->fresh());
    $this->getJson('/api/v1/admin/bornes')->assertForbidden();
});

it('enregistre le reversement d’un mois clos, une seule fois, avec des montants figés', function () {
    [$station, $borne, $prise] = stationAvecBorne('Lac', commission: 10);
    $moisDernier = now()->subMonthNoOverflow()->startOfMonth();
    sessionTerminee($borne, $prise, 200, $moisDernier->copy()->addDays(3));
    Sanctum::actingAs(superAdmin());

    $periode = $moisDernier->format('Y-m');
    $this->postJson("/api/v1/admin/stations/{$station->id}/reversements", ['periode' => now()->format('Y-m')])->assertUnprocessable();
    $this->postJson("/api/v1/admin/stations/{$station->id}/reversements", ['periode' => $periode, 'reference' => 'VIR-001'])->assertOk();
    $this->postJson("/api/v1/admin/stations/{$station->id}/reversements", ['periode' => $periode])->assertUnprocessable();

    $releve = collect($this->getJson("/api/v1/admin/stations/{$station->id}?annee={$moisDernier->year}")->json('releves'))->firstWhere('periode', $periode);
    expect($releve)->statut->toBe('paye')->net->toEqual(180)->reference->toBe('VIR-001');
});

it('réserve les paramètres de la plateforme au personnel Volteo', function () {
    [, , , $admin] = stationAvecBorne('Lac');
    Sanctum::actingAs($admin);
    $this->putJson('/api/v1/admin/parametres', ['tva_taux' => 0])->assertForbidden();
});

it('fait dialoguer une station et Volteo, sans fuite entre stations', function () {
    [$stationA, , , $adminA] = stationAvecBorne('Lac');
    [$stationB, , , $adminB] = stationAvecBorne('Sahel');
    $super = superAdmin();

    Sanctum::actingAs($adminA);
    $this->postJson('/api/v1/admin/ma-station/messages', ['contenu' => 'Pouvez-vous ajouter 2 bornes ?', 'categorie' => 'demande'])->assertCreated();

    Sanctum::actingAs($super);
    $index = collect($this->getJson('/api/v1/admin/stations')->json('stations'))->keyBy('id');
    expect($index[$stationA->id]['messagesNonLus'])->toBe(1)->and($index[$stationB->id]['messagesNonLus'])->toBe(0);
    $this->getJson("/api/v1/admin/stations/{$stationA->id}/messages")->assertOk()->assertJsonCount(1);
    $this->postJson("/api/v1/admin/stations/{$stationA->id}/messages", ['contenu' => 'C’est noté.'])->assertCreated();
    $this->postJson('/api/v1/admin/stations-annonce', ['contenu' => 'Maintenance dimanche.'])->assertCreated()->assertJson(['stations' => 2]);

    Sanctum::actingAs($adminA);
    expect($this->getJson('/api/v1/admin/ma-station')->json('messagesNonLus'))->toBe(2);
    expect(collect($this->getJson('/api/v1/admin/ma-station/messages')->json())->pluck('categorie')->all())->toBe(['demande', 'message', 'annonce']);

    // La station B ne voit que l'annonce, et ne peut pas lire le fil du super-admin.
    Sanctum::actingAs($adminB);
    expect($this->getJson('/api/v1/admin/ma-station/messages')->json())->toHaveCount(1);
    $this->getJson("/api/v1/admin/stations/{$stationA->id}/messages")->assertForbidden();
});

it('montre à la station ses recharges en cours, la puissance par borne et ses clients', function () {
    [, $borne, $prise, $admin] = stationAvecBorne('Lac');
    sessionTerminee($borne, $prise, 12);
    $client = User::factory()->create(['role' => 'client', 'prenom' => 'Sami', 'nom' => 'Ben Ali']);
    SessionRecharge::create(['user_id' => $client->id, 'borne_id' => $borne->id, 'connecteur_id' => $prise->id, 'etat' => 'en_cours',
        'date_debut' => now()->subMinutes(20), 'energie_kwh' => 4.2, 'prix' => 2.1, 'puissance_instantanee_kw' => 21.5, 'pourcentage_batterie' => 48]);

    Sanctum::actingAs($admin);
    $r = $this->getJson('/api/v1/admin/ma-station')->assertOk();
    expect($r->json('recharges.0'))->toMatchArray(['client' => 'Sami Ben Ali', 'puissanceKw' => 21.5, 'batterie' => 48])
        ->and($r->json('bornes.0.puissanceActuelleKw'))->toBe(21.5)
        ->and($r->json('clients'))->toHaveCount(1);
});

it('donne au super-admin un nouveau mot de passe pour un admin de station', function () {
    [$station, , , $admin] = stationAvecBorne('Lac');
    [$autre, , , $adminAutre] = stationAvecBorne('Sahel');
    Sanctum::actingAs(superAdmin());

    $mdp = $this->postJson("/api/v1/admin/stations/{$station->id}/personnel/{$admin->id}/mot-de-passe")->assertOk()->json('motDePasse');
    $this->postJson("/api/v1/admin/stations/{$station->id}/personnel/{$adminAutre->id}/mot-de-passe")->assertNotFound();
    expect(\Illuminate\Support\Facades\Hash::check($mdp, $admin->fresh()->password))->toBeTrue();

    Sanctum::actingAs($admin->fresh());
    $this->postJson("/api/v1/admin/stations/{$station->id}/personnel/{$admin->id}/mot-de-passe")->assertForbidden();
});
