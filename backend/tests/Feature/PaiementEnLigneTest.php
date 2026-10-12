<?php

use App\Models\Paiement;
use App\Models\TransactionPaiement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

it('recharge le wallet par carte en mode test, après vérification et une seule fois', function () {
    config(['services.paiement.mode' => 'test']);
    $client = User::factory()->create(['role' => 'client', 'solde_wallet' => 10]);
    Sanctum::actingAs($client);

    expect(collect($this->getJson('/api/v1/paiements/moyens')->json('moyens'))->pluck('moyen')->all())->toBe(['carte', 'flouci', 'edinar']);

    $ref = $this->postJson('/api/v1/paiements/en-ligne', ['objet' => 'recharge_wallet', 'montant' => 50, 'moyen' => 'carte'])->assertCreated()->json('reference');
    $t = TransactionPaiement::where('reference', $ref)->first();

    // Tant que le client n'a pas payé : rien n'est crédité.
    $this->getJson("/api/v1/paiements/en-ligne/{$ref}")->assertJson(['statut' => 'en_cours']);
    expect((float) $client->fresh()->solde_wallet)->toBe(10.0);

    // Carte de test acceptée sur la page de paiement.
    $t->update(['reponse' => ['resultat_test' => 'reussie']]);
    $this->get("/paiement/retour/{$ref}")->assertRedirect();
    $this->getJson("/api/v1/paiements/en-ligne/{$ref}")->assertJson(['statut' => 'reussie', 'soldeWallet' => 60]);
    $this->get("/paiement/retour/{$ref}");
    expect((float) $client->fresh()->solde_wallet)->toBe(60.0)
        ->and(Paiement::where('user_id', $client->id)->where('methode', 'topup_carte')->count())->toBe(1);
});

it('ne crédite rien si la carte est refusée', function () {
    config(['services.paiement.mode' => 'test']);
    $client = User::factory()->create(['role' => 'client', 'solde_wallet' => 10]);
    Sanctum::actingAs($client);
    $ref = $this->postJson('/api/v1/paiements/en-ligne', ['objet' => 'recharge_wallet', 'montant' => 20, 'moyen' => 'carte'])->json('reference');
    TransactionPaiement::where('reference', $ref)->first()->update(['reponse' => ['resultat_test' => 'echouee']]);

    $this->getJson("/api/v1/paiements/en-ligne/{$ref}")->assertJson(['statut' => 'echouee']);
    expect((float) $client->fresh()->solde_wallet)->toBe(10.0);
});

it('passe par Flouci quand ses clés sont configurées et vérifie le paiement auprès de Flouci', function () {
    config(['services.paiement.flouci' => ['public' => 'pub', 'prive' => 'priv']]);
    Http::fake([
        'developers.flouci.com/api/v2/generate_payment' => Http::response(['result' => ['success' => true, 'payment_id' => 'PAY123', 'link' => 'https://checkout.flouci.com/x/PAY123']]),
        'developers.flouci.com/api/v2/verify_payment/PAY123' => Http::response(['success' => true, 'result' => ['status' => 'SUCCESS', 'amount' => 30000]]),
    ]);
    $client = User::factory()->create(['role' => 'client', 'solde_wallet' => 0]);
    Sanctum::actingAs($client);

    $r = $this->postJson('/api/v1/paiements/en-ligne', ['objet' => 'recharge_wallet', 'montant' => 30, 'moyen' => 'flouci'])->assertCreated();
    expect($r->json('url'))->toBe('https://checkout.flouci.com/x/PAY123')->and($r->json('passerelle'))->toBe('flouci');
    Http::assertSent(fn ($req) => str_contains($req->url(), 'generate_payment') && $req['amount'] === '30000' && $req->hasHeader('Authorization', 'Bearer pub:priv'));

    // Webhook : on ne fait pas confiance au contenu, on revérifie chez Flouci.
    $this->postJson('/api/v1/paiements/webhook/flouci', ['payment_id' => 'PAY123'])->assertOk();
    expect((float) $client->fresh()->solde_wallet)->toBe(30.0);
});

it('règle une recharge impayée par carte', function () {
    config(['services.paiement.mode' => 'test']);
    $client = User::factory()->create(['role' => 'client']);
    $p = Paiement::create(['user_id' => $client->id, 'montant' => 12.5, 'methode' => 'wallet', 'statut' => 'en_attente']);
    Sanctum::actingAs($client);

    $ref = $this->postJson('/api/v1/paiements/en-ligne', ['objet' => 'reglement', 'paiement_id' => $p->id, 'moyen' => 'carte'])->json('reference');
    expect(TransactionPaiement::where('reference', $ref)->value('montant'))->toBe(12.5);
    TransactionPaiement::where('reference', $ref)->first()->update(['reponse' => ['resultat_test' => 'reussie']]);
    $this->getJson("/api/v1/paiements/en-ligne/{$ref}")->assertJson(['statut' => 'reussie']);
    expect($p->fresh()->statut)->toBe('paye');
});
