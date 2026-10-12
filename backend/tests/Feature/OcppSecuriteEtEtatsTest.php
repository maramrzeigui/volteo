<?php

use App\Models\Alerte;
use App\Models\BadgeRfid;
use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\Paiement;
use App\Models\SessionRecharge;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

/** Sécurité OCPP (Security Profile 1), états calculés des bornes et comptage d'énergie. */
function ocBorne(array $attributs = [], int $prises = 2): Borne
{
    $borne = Borne::create([
        'nom' => 'Borne Sécurité', 'reference' => 'BRN-SEC-'.uniqid(), 'adresse' => 'Tunis',
        'latitude' => 36.8, 'longitude' => 10.18, 'version_ocpp' => '1.6', 'puissance_kw' => 22,
        'etat' => 'disponible', 'tarif_kwh' => 0.5, 'dernier_heartbeat' => now(), ...$attributs,
    ]);
    for ($i = 0; $i < $prises; $i++) {
        Connecteur::create(['borne_id' => $borne->id, 'type' => 'Type2', 'puissance_kw' => 22, 'etat' => 'disponible']);
    }

    return $borne->load('connecteurs');
}

function ocClient(array $attributs = []): User
{
    return User::create([
        'name' => 'Client OC', 'nom' => 'OC', 'prenom' => 'Client', 'email' => uniqid('oc').'@test.tn',
        'password' => 'password', 'role' => 'client', 'solde_wallet' => 100, ...$attributs,
    ]);
}

function ocSession(Borne $borne, User $user, array $attributs = []): SessionRecharge
{
    return SessionRecharge::create([
        'user_id' => $user->id, 'borne_id' => $borne->id, 'connecteur_id' => $borne->connecteurs[0]->id,
        'date_debut' => now(), 'energie_kwh' => 0, 'prix' => 0, 'etat' => 'en_cours', ...$attributs,
    ]);
}

function ocpp(string $chemin, array $donnees)
{
    return test()->postJson("/api/v1/internal/ocpp/{$chemin}", $donnees, ['X-Ocpp-Secret' => config('services.ocpp.secret')]);
}

// --- Security Profile 1 : authentification des bornes ---

it('authentifie la borne par son mot de passe OCPP', function () {
    Queue::fake();
    $borne = ocBorne();
    $borne->forceFill(['ocpp_mot_de_passe' => 'secret-de-la-borne'])->save();

    ocpp('connexion', ['reference' => $borne->reference, 'motDePasse' => 'secret-de-la-borne'])
        ->assertOk()->assertJsonPath('accepte', true);
    ocpp('connexion', ['reference' => $borne->reference, 'motDePasse' => 'mauvais'])
        ->assertUnauthorized()->assertJsonPath('accepte', false);
    ocpp('connexion', ['reference' => $borne->reference])->assertUnauthorized();
    ocpp('connexion', ['reference' => 'BRN-INCONNUE'])->assertUnauthorized();

    expect(Alerte::where('borne_id', $borne->id)->where('type', 'erreur_ocpp')->exists())->toBeTrue()
        // Le mot de passe est haché et jamais exposé.
        ->and($borne->fresh()->getAttributes()['ocpp_mot_de_passe'])->not->toBe('secret-de-la-borne')
        ->and($borne->fresh()->toArray())->not->toHaveKey('ocpp_mot_de_passe');
});

it('refuse une borne sans mot de passe sauf si la configuration le permet', function () {
    $borne = ocBorne();

    ocpp('connexion', ['reference' => $borne->reference])->assertUnauthorized();

    config(['services.ocpp.exiger_mot_de_passe' => false]);
    ocpp('connexion', ['reference' => $borne->reference])->assertOk()->assertJsonPath('accepte', true);
});

it('refuse les bornes publiques d’autres opérateurs', function () {
    $borne = ocBorne(['source' => 'publique']);
    $borne->forceFill(['ocpp_mot_de_passe' => 'x'])->save();

    ocpp('connexion', ['reference' => $borne->reference, 'motDePasse' => 'x'])->assertUnauthorized();
});

it('génère un mot de passe OCPP depuis le back-office, affiché une seule fois', function () {
    $borne = ocBorne();
    Sanctum::actingAs(User::create([
        'name' => 'Admin', 'nom' => 'A', 'prenom' => 'A', 'email' => 'admin-oc@test.tn', 'password' => 'password', 'role' => 'super_admin',
    ]));

    $motDePasse = $this->postJson("/api/v1/admin/bornes/{$borne->id}/mot-de-passe-ocpp")
        ->assertOk()->assertJsonPath('identifiant', $borne->reference)->json('motDePasse');

    expect(strlen($motDePasse))->toBe(40)->and($motDePasse)->not->toContain(':');
    ocpp('connexion', ['reference' => $borne->reference, 'motDePasse' => $motDePasse])->assertOk();
    $this->getJson("/api/v1/admin/bornes/{$borne->id}")->assertOk()->assertJsonPath('borne.ocppSecurise', true);
});

it('refuse le secret de développement en production', function () {
    app()->detectEnvironment(fn () => 'production');
    config(['services.ocpp.secret' => config('services.ocpp.secret_dev')]);

    ocpp('heartbeat', ['reference' => 'X'])->assertStatus(503);
});

// --- États calculés : occupée, indisponible, déconnectée ---

it('calcule l’état de la borne à partir des StatusNotification de ses prises', function () {
    $borne = ocBorne();

    ocpp('status', ['reference' => $borne->reference, 'connectorId' => 1, 'status' => 'Charging'])->assertOk();
    expect($borne->fresh()->etat)->toBe('occupee');

    ocpp('status', ['reference' => $borne->reference, 'connectorId' => 1, 'status' => 'Available'])->assertOk();
    expect($borne->fresh()->etat)->toBe('disponible');

    // Connecteur 0 = borne entière : indisponibilité signalée par la borne, puis retour.
    ocpp('status', ['reference' => $borne->reference, 'connectorId' => 0, 'status' => 'Unavailable'])->assertOk();
    expect($borne->fresh()->etat)->toBe('indisponible');
    ocpp('status', ['reference' => $borne->reference, 'connectorId' => 0, 'status' => 'Available'])->assertOk();
    expect($borne->fresh()->etat)->toBe('disponible');
});

it('ne laisse pas les messages OCPP écraser un état fixé par l’exploitant', function () {
    $borne = ocBorne(['etat' => 'maintenance']);

    ocpp('status', ['reference' => $borne->reference, 'connectorId' => 1, 'status' => 'Available'])->assertOk();
    ocpp('heartbeat', ['reference' => $borne->reference])->assertOk();

    expect($borne->fresh()->etat)->toBe('maintenance');
});

it('passe la borne déconnectée dès la perte du WebSocket et la rétablit à la reconnexion', function () {
    Queue::fake();
    $borne = ocBorne();
    $borne->connecteurs[0]->update(['etat' => 'occupe']);

    ocpp('deconnexion', ['reference' => $borne->reference])->assertOk();
    $borne->refresh();
    expect($borne->etat)->toBe('deconnectee')
        ->and($borne->deconnectee_le)->not->toBeNull()
        ->and($borne->estEnLigne())->toBeFalse()
        // Pas d'alerte pour une micro-coupure : elle attend le délai de heartbeat.
        ->and(Alerte::where('borne_id', $borne->id)->where('type', 'borne_deconnectee')->exists())->toBeFalse();

    ocpp('boot', ['reference' => $borne->reference])->assertOk()->assertJsonPath('status', 'Accepted');
    $borne->refresh();
    // L'état est recalculé depuis les prises (une prise occupée), pas forcé à « disponible ».
    expect($borne->etat)->toBe('occupee')->and($borne->deconnectee_le)->toBeNull();
});

it('lève l’alerte de déconnexion une seule fois après le délai sans heartbeat', function () {
    Queue::fake();
    $borne = ocBorne(['dernier_heartbeat' => now()->subMinutes(10)]);
    ocpp('deconnexion', ['reference' => $borne->reference]);

    $this->artisan('bornes:verifier-heartbeats')->assertSuccessful();
    $this->artisan('bornes:verifier-heartbeats')->assertSuccessful();

    expect(Alerte::where('borne_id', $borne->id)->where('type', 'borne_deconnectee')->count())->toBe(1);

    ocpp('heartbeat', ['reference' => $borne->reference])->assertOk();
    expect($borne->fresh()->etat)->toBe('disponible')
        ->and(Alerte::where('borne_id', $borne->id)->where('type', 'borne_deconnectee')->value('resolue'))->toBeTruthy();
});

it('refuse de démarrer une recharge sur une borne déconnectée', function () {
    $borne = ocBorne(['etat' => 'deconnectee']);
    Sanctum::actingAs(ocClient());

    $this->postJson('/api/v1/sessions', ['borne_id' => $borne->id, 'connecteur_id' => $borne->connecteurs[0]->id])
        ->assertUnprocessable()
        ->assertJsonPath('errors.borne_id.0', 'Cette borne est hors ligne pour le moment. Choisissez une autre borne ou réessayez plus tard.');

    expect(SessionRecharge::count())->toBe(0);
});

it('annule la session et libère la prise quand la borne refuse le démarrage', function () {
    Http::fake(['*/commands/remote-start' => Http::response(['message' => 'La borne a refusé le démarrage (Rejected).', 'raison' => 'refus'], 502)]);
    $borne = ocBorne();
    Sanctum::actingAs(ocClient());

    $this->postJson('/api/v1/sessions', ['borne_id' => $borne->id, 'connecteur_id' => $borne->connecteurs[0]->id])
        ->assertUnprocessable();

    expect(SessionRecharge::first()->etat)->toBe('annulee')
        ->and($borne->connecteurs[0]->fresh()->etat)->toBe('disponible');
    Http::assertSent(fn ($r) => $r['idTag'] === 'APP-'.SessionRecharge::first()->id);
});

// --- Comptage d'énergie et intégrité des sessions ---

it('calcule l’énergie depuis l’index du compteur (meterStart) et garde l’énergie si l’index manque', function () {
    $borne = ocBorne();
    $user = ocClient();
    $session = ocSession($borne, $user);

    ocpp('start-transaction', [
        'reference' => $borne->reference, 'connectorId' => 1, 'idTag' => 'APP-'.$session->id, 'meterStart' => 1_250_000,
    ])->assertOk()->assertJsonPath('sessionId', $session->id);

    ocpp('meter-values', ['reference' => $borne->reference, 'sessionId' => $session->id, 'indexWh' => 1_256_500, 'puissanceKw' => 21])->assertOk();
    expect($session->fresh()->energie_kwh)->toBe(6.5)->and($session->fresh()->prix)->toBe(3.25);

    // Mesure sans index d'énergie (SoC seul) : l'énergie n'est pas remise à zéro.
    ocpp('meter-values', ['reference' => $borne->reference, 'sessionId' => $session->id, 'pourcentageBatterie' => 70])->assertOk();
    expect($session->fresh()->energie_kwh)->toBe(6.5)->and($session->fresh()->pourcentage_batterie)->toBe(70);

    ocpp('stop-transaction', ['reference' => $borne->reference, 'sessionId' => $session->id, 'indexWh' => 1_260_000])->assertOk();
    expect($session->fresh()->etat)->toBe('terminee')->and($session->fresh()->energie_kwh)->toBe(10.0);
});

it('ne fait jamais baisser le niveau de batterie pendant une recharge', function () {
    $borne = ocBorne();
    $session = ocSession($borne, ocClient());

    foreach ([43, 22, 47] as $soc) {
        ocpp('meter-values', ['reference' => $borne->reference, 'sessionId' => $session->id, 'pourcentageBatterie' => $soc])->assertOk();
    }

    expect($session->fresh()->pourcentage_batterie)->toBe(47);
});

it('plafonne la puissance mesurée à la puissance nominale de la prise', function () {
    $borne = ocBorne();
    $session = ocSession($borne, ocClient());

    ocpp('meter-values', ['reference' => $borne->reference, 'sessionId' => $session->id, 'indexWh' => 100, 'puissanceKw' => 54])->assertOk();

    expect($session->fresh()->puissance_instantanee_kw)->toBe(23.1); // 22 kW + 5 % de tolérance
});

it('refuse qu’une borne mesure ou arrête la session d’une autre borne', function () {
    Queue::fake();
    $borne = ocBorne();
    $intruse = ocBorne();
    $session = ocSession($borne, ocClient());

    ocpp('meter-values', ['reference' => $intruse->reference, 'sessionId' => $session->id, 'energieKwh' => 999])->assertForbidden();
    ocpp('stop-transaction', ['reference' => $intruse->reference, 'sessionId' => $session->id])->assertForbidden();

    expect($session->fresh()->energie_kwh)->toBe(0.0)
        ->and($session->fresh()->etat)->toBe('en_cours')
        ->and(Alerte::where('borne_id', $intruse->id)->where('gravite', 'critique')->exists())->toBeTrue();
});

it('traite un badge à UID numérique comme un badge, pas comme une session', function () {
    $borne = ocBorne();
    $user = ocClient();
    BadgeRfid::create(['uid' => '12345678', 'user_id' => $user->id]);
    ocSession($borne, ocClient(), ['id' => 12345678, 'etat' => 'terminee']);

    $sessionId = ocpp('start-transaction', ['reference' => $borne->reference, 'connectorId' => 2, 'idTag' => '12345678'])
        ->assertOk()->assertJsonPath('status', 'Accepted')->json('sessionId');

    expect(SessionRecharge::find($sessionId)->origine)->toBe('rfid')
        ->and(SessionRecharge::find($sessionId)->user_id)->toBe($user->id);
});

it('ne facture qu’une fois une session arrêtée deux fois', function () {
    $borne = ocBorne();
    $user = ocClient();
    Sanctum::actingAs($user);
    $session = ocSession($borne, $user, ['energie_kwh' => 4]);

    $this->postJson("/api/v1/sessions/{$session->id}/stop")->assertOk();
    $this->postJson("/api/v1/sessions/{$session->id}/stop")->assertStatus(409);
    ocpp('stop-transaction', ['reference' => $borne->reference, 'sessionId' => $session->id])->assertNotFound();

    expect(Paiement::where('session_recharge_id', $session->id)->count())->toBe(1)
        ->and((float) $user->fresh()->solde_wallet)->toBe(98.0);
});

// --- Authentification renforcée ---

it('invalide le code 2FA après 5 essais erronés', function () {
    Mail::fake();
    $user = ocClient(['email' => 'deuxfa@test.tn']);
    $user->forceFill(['two_factor_enabled' => true])->save();

    $this->postJson('/api/v1/auth/login', ['email' => 'deuxfa@test.tn', 'password' => 'password'])->assertJsonPath('twoFactor', true);
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/auth/2fa/verify', ['email' => 'deuxfa@test.tn', 'code' => '000000'])->assertUnprocessable();
    }

    expect($user->fresh()->two_factor_code)->toBeNull();
});

it('exige un mot de passe de 8 caractères à l’inscription', function () {
    $this->postJson('/api/v1/auth/register', ['nom' => 'N', 'prenom' => 'P', 'email' => 'court@test.tn', 'password' => 'abc123'])
        ->assertUnprocessable()->assertJsonValidationErrors('password');
});

it('répond en français quand la limite de débit est atteinte', function () {
    for ($i = 0; $i < 10; $i++) {
        $this->postJson('/api/v1/auth/login', ['email' => 'x@test.tn', 'password' => 'y']);
    }

    $this->postJson('/api/v1/auth/login', ['email' => 'x@test.tn', 'password' => 'y'])
        ->assertStatus(429)
        ->assertJsonPath('message', fn (string $m) => str_starts_with($m, 'Trop de tentatives.'));
});

it('refuse le crédit carte direct en production : la carte passe par une passerelle', function () {
    app()->detectEnvironment(fn () => 'production');
    Sanctum::actingAs(ocClient());

    $this->postJson('/api/v1/wallet/topup', ['montant' => 50])->assertStatus(409);
});

// --- Simulateur SAP ---

it('génère la configuration du simulateur SAP depuis les bornes de la base', function () {
    $dossier = storage_path('framework/testing/sap-'.uniqid());
    File::ensureDirectoryExists("{$dossier}/src/assets");
    File::ensureDirectoryExists("{$dossier}/ui/web");
    $borne = ocBorne(['reference' => 'BRN-SAP-001', 'modele' => 'Terra AC', 'fabricant' => 'ABB']);
    $proprietaire = ocClient();
    BadgeRfid::create(['uid' => 'AA:BB', 'user_id' => $proprietaire->id]);
    $proprietaire->vehicules()->create(['marque' => 'Renault', 'modele' => 'Mégane E-Tech', 'immatriculation' => '1 TU 1', 'type_connecteur' => 'CCS', 'capacite_batterie_kwh' => 60]);

    $this->artisan('ocpp:simulateur-sap', ['dossier' => $dossier, '--url' => 'ws://127.0.0.1:9220/ocpp'])->assertSuccessful();

    $config = json_decode(File::get("{$dossier}/src/assets/config.json"), true);
    $modele = json_decode(File::get("{$dossier}/src/assets/station-templates/borneapp/BRN-SAP-001.station-template.json"), true);
    $brut = File::get("{$dossier}/src/assets/station-templates/borneapp/BRN-SAP-001.station-template.json");
    expect(json_decode($brut)->Connectors)->toBeObject(); // le schéma SAP exige un objet, pas une liste

    expect($config['supervisionUrls'])->toBe(['ws://127.0.0.1:9220/ocpp'])
        ->and($config['stationTemplateUrls'][0]['file'])->toBe('borneapp/BRN-SAP-001.station-template.json')
        ->and($modele['baseName'])->toBe('BRN-SAP-001')
        ->and($modele['fixedName'])->toBeTrue()
        ->and($modele['currentOutType'])->toBe('AC')
        ->and($modele['numberOfConnectors'])->toBe(2)
        ->and($modele['Connectors']['1']['maximumPower'])->toBe(22000)
        ->and(json_decode(File::get("{$dossier}/src/assets/idtags-borneapp.json")))->toBe(['AA:BB'])
        // Le mot de passe écrit dans le modèle est celui que l'API accepte.
        ->and($borne->fresh()->verifierMotDePasseOcpp($modele['supervisionPassword']))->toBeTrue();

    // Mesures physiquement cohérentes, avec les véhicules réels de la base.
    $profils = json_decode(File::get("{$dossier}/src/assets/ev-profiles-borneapp.json"), true)['profiles'];
    expect($modele['coherentMeterValues'])->toBeTrue()
        ->and($modele['evProfilesFile'])->toBe('ev-profiles-borneapp.json')
        ->and($profils[0]['id'])->toBe('renault-megane-e-tech')
        ->and($profils[0]['batteryCapacityWh'])->toBe(60000)
        ->and($profils[0]['maxPowerW'])->toBe(120000);

    // Interface web : mêmes identifiants que le serveur UI, jamais admin/admin.
    $ui = json_decode(File::get("{$dossier}/ui/web/public/config.json"), true);
    expect($ui['uiServer']['authentication'])->toBe($config['uiServer']['authentication'])
        ->and($ui['uiServer']['authentication']['password'])->not->toBe('admin');

    File::deleteDirectory($dossier);
});
