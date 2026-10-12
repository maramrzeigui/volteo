<?php

use App\Jobs\EnvoyerNotificationsAlerte;
use App\Models\Abonnement;
use App\Models\Alerte;
use App\Models\AuditLog;
use App\Models\BadgeRfid;
use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\DeploiementFirmware;
use App\Models\Facture;
use App\Models\Firmware;
use App\Models\Maintenance;
use App\Models\NotificationEnvoyee;
use App\Models\Paiement;
use App\Models\Panne;
use App\Models\Parametre;
use App\Models\SessionRecharge;
use App\Models\Souscription;
use App\Models\Tarif;
use App\Models\User;
use App\Models\Vehicule;
use App\Services\Tarification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

/** Tests des modules du cahier des charges « plateforme web ». */
function pwBorne(array $attributs = [], int $connecteurs = 2): Borne
{
    $borne = Borne::create([
        'nom' => 'Borne PW', 'reference' => 'BRN-PW-'.uniqid(), 'numero_serie' => 'SN-'.uniqid(),
        'modele' => 'Terra', 'fabricant' => 'ABB', 'adresse' => 'Tunis', 'latitude' => 36.8, 'longitude' => 10.18,
        'version_firmware' => '1.0.0', 'version_ocpp' => '1.6', 'puissance_kw' => 50, 'etat' => 'disponible',
        'tarif_kwh' => 0.5, 'dernier_heartbeat' => now(), ...$attributs,
    ]);
    for ($i = 0; $i < $connecteurs; $i++) {
        Connecteur::create(['borne_id' => $borne->id, 'type' => 'CCS', 'puissance_kw' => 50, 'etat' => 'disponible']);
    }

    return $borne->load('connecteurs');
}

function pwUser(string $role, array $attributs = []): User
{
    return User::create([
        'name' => "PW $role", 'nom' => $role, 'prenom' => 'PW', 'email' => uniqid($role).'@pw.tn',
        'password' => 'password', 'role' => $role, ...$attributs,
    ]);
}

function pwActing(string $role, array $attributs = []): User
{
    $user = pwUser($role, $attributs);
    Sanctum::actingAs($user);

    return $user;
}

function pwOcpp(): array
{
    return ['X-Ocpp-Secret' => config('services.ocpp.secret')];
}

// --- §7 Matrice des permissions ---

it('applique la matrice des permissions par module et par niveau', function () {
    pwBorne();

    pwActing('technicien');
    $this->getJson('/api/v1/admin/maintenances')->assertOk();
    $this->getJson('/api/v1/admin/bornes')->assertOk();
    $this->postJson('/api/v1/admin/bornes', [])->assertForbidden(); // bornes en lecture seule
    $this->getJson('/api/v1/admin/paiements')->assertForbidden();

    pwActing('finance');
    $this->getJson('/api/v1/admin/paiements')->assertOk();
    $this->getJson('/api/v1/admin/maintenances')->assertForbidden();

    pwActing('client');
    $this->getJson('/api/v1/admin/bornes')->assertForbidden();
});

it('permet au super administrateur seul de modifier la matrice', function () {
    pwActing('exploitant');
    $this->putJson('/api/v1/admin/permissions', ['matrice' => ['technicien' => ['paiements' => 'lecture']]])->assertForbidden();

    pwActing('super_admin');
    $this->putJson('/api/v1/admin/permissions', ['matrice' => ['technicien' => ['paiements' => 'lecture']]])->assertOk();

    pwActing('technicien');
    $this->getJson('/api/v1/admin/paiements')->assertOk();
    $this->getJson('/api/v1/auth/me')->assertJsonPath('permissions.paiements', 'lecture');
});

it('refuse la connexion à un compte désactivé', function () {
    pwUser('client', ['email' => 'inactif@pw.tn', 'actif' => false]);

    $this->postJson('/api/v1/auth/login', ['email' => 'inactif@pw.tn', 'password' => 'password'])
        ->assertUnprocessable();
});

it('impose la double authentification au personnel si paramétrée', function () {
    Parametre::enregistrer(['deux_facteurs_personnel' => true]);
    pwUser('technicien', ['email' => 'tech2fa@pw.tn']);

    $this->postJson('/api/v1/auth/login', ['email' => 'tech2fa@pw.tn', 'password' => 'password'])
        ->assertOk()->assertJson(['twoFactor' => true]);
});

// --- Module 10 : tarification ---

it('calcule le prix selon le mode, les heures creuses et les frais de session', function () {
    Parametre::enregistrer(['fuseau_horaire' => 'UTC']);
    $service = app(Tarification::class);
    $tarif = Tarif::create([
        'nom' => 'HC', 'mode' => 'kwh', 'prix' => 0.60, 'prix_heures_creuses' => 0.30,
        'heures_creuses_debut' => '22:00', 'heures_creuses_fin' => '06:00', 'frais_session' => 1,
    ]);

    $nuit = now()->setTime(23, 30);
    $jour = now()->setTime(14, 0);
    expect($service->prixBrut($tarif, 0, 10, 3600, 50, $nuit))->toBe(4.0)   // 10 × 0,30 + 1
        ->and($service->prixBrut($tarif, 0, 10, 3600, 50, $jour))->toBe(7.0); // 10 × 0,60 + 1

    $minute = Tarif::create(['nom' => 'Minute', 'mode' => 'minute', 'prix' => 0.05]);
    $puissance = Tarif::create(['nom' => 'kW', 'mode' => 'puissance', 'prix' => 0.02]);
    expect($service->prixBrut($minute, 0, 10, 1800, 50, $jour))->toBe(1.5)          // 30 min × 0,05
        ->and(round($service->prixBrut($puissance, 0, 10, 3600, 50, $jour), 2))->toBe(1.0); // 50 kW × 1 h × 0,02
});

it('privilégie le tarif spécial valide et applique l’abonnement', function () {
    $borne = pwBorne();
    $standard = Tarif::create(['nom' => 'Standard', 'mode' => 'kwh', 'prix' => 0.50]);
    $promo = Tarif::create(['nom' => 'Promo', 'mode' => 'kwh', 'prix' => 0.20, 'special' => true, 'valide_du' => today()->subDay(), 'valide_au' => today()->addDay()]);
    $borne->update(['tarif_id' => $standard->id, 'tarif_special_id' => $promo->id]);

    expect(app(Tarification::class)->tarifApplicable($borne->fresh())->id)->toBe($promo->id);

    $promo->update(['valide_au' => today()->subDay()]);
    expect(app(Tarification::class)->tarifApplicable($borne->fresh())->id)->toBe($standard->id);

    // Abonnement : 5 kWh inclus puis 50 % de remise.
    $client = pwUser('client');
    $abo = Abonnement::create(['nom' => 'Test', 'prix_mensuel' => 10, 'remise_pourcent' => 50, 'kwh_inclus' => 5]);
    Souscription::create(['user_id' => $client->id, 'abonnement_id' => $abo->id, 'date_debut' => today(), 'date_fin' => today()->addMonth()]);

    $session = SessionRecharge::create([
        'user_id' => $client->id, 'borne_id' => $borne->id, 'connecteur_id' => $borne->connecteurs[0]->id,
        'tarif_id' => $standard->id, 'date_debut' => now(), 'energie_kwh' => 15, 'prix' => 0, 'etat' => 'en_cours',
    ]);

    expect(app(Tarification::class)->calculer($session))->toBe(2.5); // (15 − 5) × 0,50 × 50 %
});

// --- Module 5 : sessions ---

it('gère le cycle complet d’une session depuis le back-office', function () {
    $borne = pwBorne();
    $client = pwUser('client', ['solde_wallet' => 50]);
    pwActing('operateur');

    $id = $this->postJson('/api/v1/admin/sessions', [
        'userId' => $client->id, 'borneId' => $borne->id, 'connecteurId' => $borne->connecteurs[0]->id,
    ])->assertCreated()->assertJsonPath('origine', 'back_office')->json('id');

    $this->postJson("/api/v1/admin/sessions/{$id}/pause")->assertOk();
    expect(SessionRecharge::find($id)->etat)->toBe('en_pause');

    $this->postJson("/api/v1/admin/sessions/{$id}/reprendre")->assertOk();
    SessionRecharge::find($id)->update(['energie_kwh' => 20]);

    $this->postJson("/api/v1/admin/sessions/{$id}/terminer")
        ->assertOk()
        ->assertJsonPath('etat', 'terminee')
        ->assertJsonPath('prix', 10);

    expect((float) $client->fresh()->solde_wallet)->toBe(40.0)
        ->and(Paiement::where('session_recharge_id', $id)->value('statut'))->toBe('paye');

    $facture = Facture::where('session_recharge_id', $id)->first();
    expect($facture->montant_ttc)->toBe(10.0)
        ->and($facture->taux_tva)->toBe(19.0)
        ->and($facture->montant_ht)->toBe(8.4)
        ->and($facture->statut)->toBe('payee');
});

it('annule une session sans facturation et libère la prise', function () {
    $borne = pwBorne();
    $client = pwUser('client', ['solde_wallet' => 50]);
    pwActing('service_client');

    $id = $this->postJson('/api/v1/admin/sessions', [
        'userId' => $client->id, 'borneId' => $borne->id, 'connecteurId' => $borne->connecteurs[0]->id,
    ])->json('id');
    SessionRecharge::find($id)->update(['energie_kwh' => 8]);

    $this->postJson("/api/v1/admin/sessions/{$id}/annuler", [])->assertUnprocessable();
    $this->postJson("/api/v1/admin/sessions/{$id}/annuler", ['motif' => 'Erreur de prise'])
        ->assertOk()->assertJsonPath('etat', 'annulee')->assertJsonPath('prix', 0);

    expect(Facture::where('session_recharge_id', $id)->exists())->toBeFalse()
        ->and($borne->connecteurs[0]->fresh()->etat)->toBe('disponible')
        ->and(AuditLog::where('action', 'session_annulee')->exists())->toBeTrue();
});

// --- Module 9 : paiements ---

it('débite la recharge du wallet puis la rembourse', function () {
    $borne = pwBorne();
    $client = pwActing('client', ['solde_wallet' => 20]);

    $id = $this->postJson('/api/v1/sessions', ['borne_id' => $borne->id, 'connecteur_id' => $borne->connecteurs[0]->id])->json('id');
    SessionRecharge::find($id)->update(['energie_kwh' => 10]);
    $this->postJson("/api/v1/sessions/{$id}/stop")->assertOk();

    $paiement = Paiement::where('session_recharge_id', $id)->first();
    expect($paiement->statut)->toBe('paye')
        ->and((float) $client->fresh()->solde_wallet)->toBe(15.0)
        ->and(Facture::where('session_recharge_id', $id)->value('statut'))->toBe('payee');

    pwActing('finance');
    $this->postJson("/api/v1/admin/paiements/{$paiement->id}/rembourser", ['montant' => 2, 'motif' => 'Geste'])
        ->assertOk()->assertJsonPath('statut', 'rembourse_partiel');
    $this->postJson("/api/v1/admin/paiements/{$paiement->id}/rembourser", ['montant' => 4, 'motif' => 'Trop'])
        ->assertUnprocessable(); // dépasse le reste remboursable (3)
    $this->postJson("/api/v1/admin/paiements/{$paiement->id}/rembourser", ['montant' => 3, 'motif' => 'Solde'])
        ->assertOk()->assertJsonPath('statut', 'rembourse');

    expect((float) $client->fresh()->solde_wallet)->toBe(20.0);
});

it('souscrit un abonnement en débitant le wallet', function () {
    $abo = Abonnement::create(['nom' => 'Confort', 'prix_mensuel' => 30, 'remise_pourcent' => 10, 'kwh_inclus' => 0]);
    $client = pwActing('client', ['solde_wallet' => 50]);

    $this->postJson('/api/v1/souscriptions', ['abonnement_id' => $abo->id])->assertCreated()->assertJsonPath('abonnementNom', 'Confort');
    $this->postJson('/api/v1/souscriptions', ['abonnement_id' => $abo->id])->assertUnprocessable();

    expect((float) $client->fresh()->solde_wallet)->toBe(20.0)
        ->and(Paiement::where('user_id', $client->id)->whereNotNull('souscription_id')->exists())->toBeTrue();
    $this->getJson('/api/v1/souscription')->assertJsonPath('remisePourcent', 10);
});

// --- Module 7 : RFID & OCPP ---

it('contrôle les badges RFID présentés à la borne (Authorize)', function () {
    $borne = pwBorne();
    $client = pwUser('client', ['solde_wallet' => 50]);
    BadgeRfid::create(['uid' => 'OK-1', 'user_id' => $client->id]);
    BadgeRfid::create(['uid' => 'BLOQUE-1', 'user_id' => $client->id, 'bloque' => true]);
    BadgeRfid::create(['uid' => 'EXPIRE-1', 'user_id' => $client->id, 'date_expiration' => today()->subDay()]);
    BadgeRfid::create(['uid' => 'STOCK-1']);

    foreach (['OK-1' => 'Accepted', 'BLOQUE-1' => 'Blocked', 'EXPIRE-1' => 'Expired', 'STOCK-1' => 'Invalid', 'INCONNU' => 'Invalid'] as $uid => $attendu) {
        $this->postJson('/api/v1/internal/ocpp/authorize', ['reference' => $borne->reference, 'idTag' => $uid], pwOcpp())
            ->assertOk()->assertJsonPath('status', $attendu);
    }
});

it('démarre une recharge au badge après StatusNotification Preparing', function () {
    $borne = pwBorne();
    $client = pwUser('client', ['solde_wallet' => 30]);
    BadgeRfid::create(['uid' => 'A1:B2', 'user_id' => $client->id]);

    $this->postJson('/api/v1/internal/ocpp/status', ['reference' => $borne->reference, 'connectorId' => 2, 'status' => 'Preparing'], pwOcpp())->assertOk();
    expect($borne->connecteurs[1]->fresh()->etat)->toBe('occupe');

    $sessionId = $this->postJson('/api/v1/internal/ocpp/start-transaction', [
        'reference' => $borne->reference, 'connectorId' => 2, 'idTag' => 'A1:B2',
    ], pwOcpp())->assertOk()->assertJsonPath('status', 'Accepted')->json('sessionId');

    $session = SessionRecharge::find($sessionId);
    expect($session->origine)->toBe('rfid')
        ->and($session->connecteur_id)->toBe($borne->connecteurs[1]->id)
        ->and($session->badge_rfid_id)->not->toBeNull();

    $this->postJson('/api/v1/internal/ocpp/stop-transaction', ['reference' => $borne->reference, 'sessionId' => $sessionId, 'energieKwh' => 12], pwOcpp())->assertOk();
    expect($session->fresh()->etat)->toBe('terminee')
        ->and($session->fresh()->prix)->toBe(6.0)
        ->and(Facture::where('session_recharge_id', $sessionId)->exists())->toBeTrue();
});

it('lève les alertes automatiques à partir des codes d’erreur OCPP', function () {
    Queue::fake();
    $borne = pwBorne();
    $statut = fn (array $p) => $this->postJson('/api/v1/internal/ocpp/status', ['reference' => $borne->reference, ...$p], pwOcpp())->assertOk();

    $statut(['connectorId' => 0, 'status' => 'Available', 'errorCode' => 'OtherError', 'vendorErrorCode' => 'DoorOpen']);
    $statut(['connectorId' => 0, 'status' => 'Faulted', 'errorCode' => 'UnderVoltage']);
    $statut(['connectorId' => 1, 'status' => 'Faulted', 'errorCode' => 'HighTemperature']);
    $this->postJson('/api/v1/internal/ocpp/erreur', ['reference' => $borne->reference, 'message' => 'NotImplemented'], pwOcpp())->assertOk();

    $types = Alerte::where('borne_id', $borne->id)->pluck('type')->all();
    expect($types)->toContain('porte_ouverte', 'coupure_electrique', 'surchauffe', 'erreur_ocpp')
        ->and($borne->connecteurs[0]->fresh()->etat)->toBe('defaut');

    Queue::assertPushed(EnvoyerNotificationsAlerte::class);
});

it('notifie les alertes selon les règles par gravité', function () {
    Mail::fake();
    $borne = pwBorne();
    Parametre::enregistrer([
        'email_alertes_destinataires' => ['ops@pw.tn'],
        'notifications_regles' => ['critique' => ['email', 'sms', 'push'], 'warning' => ['push']],
        'sms_actif' => false,
    ]);

    // QUEUE_CONNECTION=sync en test : le job s'exécute immédiatement.
    Alerte::lever($borne, 'surchauffe', 'critique', 'Trop chaud');

    expect(NotificationEnvoyee::where('canal', 'email')->where('destinataire', 'ops@pw.tn')->value('statut'))->toBe('envoyee')
        ->and(NotificationEnvoyee::where('canal', 'sms')->count())->toBe(0) // aucun numéro configuré
        ->and(NotificationEnvoyee::where('canal', 'push')->value('statut'))->toBe('envoyee');

    // Pas de doublon tant que l'alerte est ouverte.
    expect(Alerte::lever($borne, 'surchauffe', 'critique', 'Encore chaud'))->toBeNull();
});

// --- Module 13 : firmware ---

it('téléverse, déploie et suit un firmware, puis le rollback', function () {
    Storage::fake();
    $borne = pwBorne(['version_firmware' => '1.0.0']);
    pwActing('technicien');

    $ancien = $this->post('/api/v1/admin/firmwares', [
        'fichier' => UploadedFile::fake()->create('abb-1.0.0.bin', 64), 'version' => '1.0.0', 'fabricant' => 'ABB',
    ], ['Accept' => 'application/json'])->assertCreated()->json('id');
    $nouveau = $this->post('/api/v1/admin/firmwares', [
        'fichier' => UploadedFile::fake()->create('abb-2.0.0.bin', 64), 'version' => '2.0.0', 'fabricant' => 'ABB',
    ], ['Accept' => 'application/json'])->assertCreated()->assertJsonStructure(['checksum'])->json('id');

    // Serveur OCPP injoignable en test : le déploiement est créé puis marqué en échec.
    $this->postJson("/api/v1/admin/firmwares/{$nouveau}/deployer", ['borneIds' => [$borne->id]])->assertOk();
    $deploiement = DeploiementFirmware::where('borne_id', $borne->id)->first();
    expect($deploiement->statut)->toBe('echec')->and($deploiement->version_precedente)->toBe('1.0.0');

    // Cycle normal remonté par la borne (FirmwareStatusNotification).
    $deploiement->update(['statut' => 'en_attente']);
    foreach (['Downloading', 'Downloaded', 'Installing', 'Installed'] as $s) {
        $this->postJson('/api/v1/internal/ocpp/firmware-status', ['reference' => $borne->reference, 'status' => $s], pwOcpp())->assertOk();
    }
    expect($deploiement->fresh()->statut)->toBe('installe')->and($borne->fresh()->version_firmware)->toBe('2.0.0');

    $this->postJson("/api/v1/admin/deploiements/{$deploiement->id}/rollback")->assertStatus(502); // borne hors ligne
    expect(DeploiementFirmware::where('rollback', true)->where('firmware_id', $ancien)->exists())->toBeTrue();
});

// --- Module 11 : maintenance ---

it('gère un ordre de travail correctif lié à une panne jusqu’à la clôture', function () {
    $borne = pwBorne(['etat' => 'defaut']);
    pwActing('technicien');

    $panne = $this->postJson('/api/v1/admin/pannes', [
        'borneId' => $borne->id, 'type' => 'electrique', 'gravite' => 'elevee', 'description' => 'Disjoncteur',
    ])->assertCreated()->json('id');

    $ot = $this->postJson('/api/v1/admin/maintenances', [
        'borneId' => $borne->id, 'panneId' => $panne, 'type' => 'corrective', 'description' => 'Remplacer le disjoncteur',
    ])->assertCreated()->assertJsonPath('statut', 'planifiee')->json('id');
    expect(Maintenance::find($ot)->reference)->toStartWith('OT-')
        ->and($borne->fresh()->etat)->toBe('maintenance')
        ->and(Panne::find($panne)->statut)->toBe('en_cours');

    $this->postJson("/api/v1/admin/maintenances/{$ot}/pieces", ['designation' => 'Disjoncteur 40A', 'quantite' => 2, 'coutUnitaire' => 35])
        ->assertOk()->assertJsonPath('coutPieces', 70);
    $this->postJson("/api/v1/admin/maintenances/{$ot}/interventions", ['debut' => now()->subHour()->toIso8601String(), 'fin' => now()->toIso8601String(), 'description' => 'Remplacement'])
        ->assertOk()->assertJsonPath('statut', 'en_cours');
    $this->postJson("/api/v1/admin/maintenances/{$ot}/commentaires", ['contenu' => 'RAS'])->assertOk()->assertJsonCount(1, 'commentaires');

    $this->putJson("/api/v1/admin/maintenances/{$ot}", ['statut' => 'terminee', 'rapport' => 'OK'])->assertOk();
    expect($borne->fresh()->etat)->toBe('disponible')
        ->and(Panne::find($panne)->statut)->toBe('resolue')
        ->and(Maintenance::find($ot)->date_fin)->not->toBeNull();
});

it('replanifie automatiquement une maintenance préventive récurrente', function () {
    $borne = pwBorne();
    pwActing('exploitant');

    $ot = $this->postJson('/api/v1/admin/maintenances', [
        'borneId' => $borne->id, 'type' => 'preventive', 'description' => 'Contrôle', 'datePrevue' => today()->toDateString(), 'periodiciteJours' => 90,
    ])->json('id');
    $this->putJson("/api/v1/admin/maintenances/{$ot}", ['statut' => 'en_cours'])->assertOk();
    $this->putJson("/api/v1/admin/maintenances/{$ot}", ['statut' => 'terminee'])->assertOk();

    $suivante = Maintenance::where('id', '!=', $ot)->first();
    expect($suivante->type)->toBe('preventive')
        ->and($suivante->date_prevue->toDateString())->toBe(today()->addDays(90)->toDateString());
});

// --- Modules 14, 17, 18 : rapports, paramètres, audit ---

it('produit chaque rapport et ses exports PDF, Excel et CSV', function () {
    $borne = pwBorne();
    $client = pwUser('client');
    SessionRecharge::create([
        'user_id' => $client->id, 'borne_id' => $borne->id, 'connecteur_id' => $borne->connecteurs[0]->id,
        'date_debut' => now()->subHours(2), 'date_fin' => now()->subHour(), 'energie_kwh' => 30, 'prix' => 15, 'etat' => 'terminee',
    ]);
    pwActing('finance');

    foreach (['consommation', 'chiffre_affaires', 'utilisation', 'disponibilite', 'top_bornes', 'top_clients', 'maintenance'] as $type) {
        $this->getJson("/api/v1/admin/rapports/{$type}")->assertOk()->assertJsonStructure(['titre', 'colonnes', 'lignes', 'totaux']);
    }
    $this->getJson('/api/v1/admin/rapports/top_bornes')->assertJsonPath('lignes.0.kwh', 30);
    $this->getJson('/api/v1/admin/rapports/inconnu')->assertNotFound();

    $this->get('/api/v1/admin/rapports/chiffre_affaires/export?format=csv')->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
    $this->get('/api/v1/admin/rapports/chiffre_affaires/export?format=xlsx')->assertOk()
        ->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    $this->get('/api/v1/admin/rapports/chiffre_affaires/export?format=pdf')->assertOk()->assertHeader('Content-Type', 'application/pdf');

    expect(AuditLog::where('action', 'export')->count())->toBe(3);
});

it('trace les modifications avec le détail avant / après', function () {
    $borne = pwBorne();
    $admin = pwActing('super_admin');

    $this->putJson("/api/v1/admin/bornes/{$borne->id}", ['nom' => 'Nouveau nom'])->assertOk();

    $log = AuditLog::where('action', 'modification')->where('cible', 'borne:'.$borne->id)->first();
    expect($log->user_id)->toBe($admin->id)
        ->and(json_decode($log->details, true)['nom'])->toBe(['Borne PW', 'Nouveau nom']);

    $this->getJson('/api/v1/admin/audit?action=modification')->assertOk()->assertJsonPath('meta.total', 1);
});

it('applique les paramètres système et masque les secrets', function () {
    pwActing('super_admin');

    $this->putJson('/api/v1/admin/parametres', ['tva_taux' => 7, 'sms_api_key' => 'cle-secrete', 'plateforme_nom' => 'MonReseau'])
        ->assertOk()
        ->assertJsonPath('tva_taux', 7)
        ->assertJsonPath('sms_api_key', '••••••••');
    expect(Parametre::get('sms_api_key'))->toBe('cle-secrete');

    // Renvoyer la valeur masquée ne remplace pas le secret.
    $this->putJson('/api/v1/admin/parametres', ['sms_api_key' => '••••••••'])->assertOk();
    expect(Parametre::get('sms_api_key'))->toBe('cle-secrete');

    $this->getJson('/api/v1/plateforme')->assertJsonPath('nom', 'MonReseau');
});

// --- Module 6 : utilisateurs ---

it('crée un membre du personnel et protège le rôle super administrateur', function () {
    pwActing('exploitant');

    $this->postJson('/api/v1/admin/users', ['nom' => 'Tech', 'prenom' => 'Nouveau', 'email' => 'nouveau@pw.tn', 'role' => 'technicien'])
        ->assertCreated()->assertJsonPath('role', 'technicien')->assertJsonPath('actif', true);
    $this->postJson('/api/v1/admin/users', ['nom' => 'X', 'prenom' => 'Y', 'email' => 'sa@pw.tn', 'role' => 'super_admin'])
        ->assertUnprocessable()->assertJsonValidationErrors('role');

    $client = pwUser('client');
    $this->putJson("/api/v1/admin/users/{$client->id}", ['actif' => false])->assertOk()->assertJsonPath('actif', false);
    expect($client->fresh()->qr_token)->not->toBeNull();
});

it('gère le cycle de vie d’un badge RFID avec son historique', function () {
    $client = pwUser('client');
    pwActing('service_client');

    $id = $this->postJson('/api/v1/admin/badges', ['uid' => 'ab:cd:ef'])->assertCreated()->assertJsonPath('statut', 'non_associe')->json('id');
    $this->putJson("/api/v1/admin/badges/{$id}", ['userId' => $client->id])->assertOk()->assertJsonPath('statut', 'actif');
    $this->postJson("/api/v1/admin/badges/{$id}/bloquer", ['motif' => 'Perdu'])->assertOk()->assertJsonPath('statut', 'bloque');
    $this->postJson("/api/v1/admin/badges/{$id}/debloquer")->assertOk()->assertJsonPath('statut', 'actif');

    $this->getJson("/api/v1/admin/badges/{$id}/historique")->assertOk()->assertJsonCount(4);
    expect(BadgeRfid::find($id)->uid)->toBe('AB:CD:EF');
});

it('permet au client de gérer ses véhicules', function () {
    $client = pwActing('client');

    $id = $this->postJson('/api/v1/vehicules', ['marque' => 'Kia', 'modele' => 'EV6', 'immatriculation' => '1 tu 2', 'typeConnecteur' => 'CCS', 'capaciteBatterieKwh' => 77])
        ->assertCreated()->assertJsonPath('immatriculation', '1 TU 2')->json('id');
    $this->putJson("/api/v1/vehicules/{$id}", ['marque' => 'Kia', 'modele' => 'EV9', 'immatriculation' => '1 TU 2', 'typeConnecteur' => 'CCS', 'capaciteBatterieKwh' => 99])
        ->assertOk()->assertJsonPath('modele', 'EV9');

    $autre = Vehicule::create(['user_id' => pwUser('client')->id, 'marque' => 'A', 'modele' => 'B', 'immatriculation' => 'C', 'type_connecteur' => 'CCS', 'capacite_batterie_kwh' => 40]);
    $this->deleteJson("/api/v1/vehicules/{$autre->id}")->assertForbidden();
    $this->deleteJson("/api/v1/vehicules/{$id}")->assertOk();
    expect($client->vehicules()->count())->toBe(0);
});

// --- API de l'application mobile ---

it('ouvre une fiche borne par sa référence (QR code) avec son tarif en vigueur', function () {
    $borne = pwBorne();
    $tarif = Tarif::create(['nom' => 'Rapide', 'mode' => 'kwh', 'prix' => 0.7, 'prix_heures_creuses' => 0.5, 'heures_creuses_debut' => '23:00', 'heures_creuses_fin' => '06:00', 'frais_session' => 0.5]);
    $borne->update(['tarif_id' => $tarif->id]);
    pwActing('client');

    $this->getJson("/api/v1/bornes/{$borne->reference}")
        ->assertOk()
        ->assertJsonPath('id', $borne->id)
        ->assertJsonPath('tarifApplique.mode', 'kwh')
        ->assertJsonPath('tarifApplique.heuresCreusesDebut', '23:00')
        ->assertJsonPath('tarifApplique.fraisSession', 0.5);
    $this->getJson("/api/v1/bornes/{$borne->id}")->assertOk()->assertJsonPath('reference', $borne->reference);
    $this->getJson('/api/v1/bornes/BRN-INCONNUE')->assertNotFound();
});

it('indique au client une recharge arrêtée au solde, payée en totalité', function () {
    $borne = pwBorne();
    $client = pwActing('client', ['solde_wallet' => 10]);

    $id = $this->postJson('/api/v1/sessions', ['borne_id' => $borne->id, 'connecteur_id' => $borne->connecteurs[0]->id])->json('id');
    $client->update(['solde_wallet' => 1]);
    SessionRecharge::find($id)->update(['energie_kwh' => 4]);

    $this->postJson("/api/v1/sessions/{$id}/stop")->assertOk()->assertJsonPath('paiementStatut', 'paye')->assertJsonPath('arretSolde', true);
    $this->assertDatabaseHas('paiements', ['session_recharge_id' => $id, 'statut' => 'paye', 'montant' => 1]);
});
