<?php

use App\Models\Abonnement;
use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\ConversationAssistant;
use App\Models\Souscription;
use App\Models\User;
use App\Services\Assistant\AssistantIndisponible;
use App\Services\Assistant\HistoriqueIncompatible;
use App\Services\Assistant\ModeleIA;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

/** Faux modèle : renvoie des réponses scriptées et enregistre chaque requête reçue. */
class FauxModeleIA implements ModeleIA
{
    /** @var list<array{system: array, messages: array, outils: array}> */
    public array $requetes = [];

    /** @param list<array|\Throwable> $reponses */
    public function __construct(public array $reponses = []) {}

    public function repondre(array $system, array $messages, array $outils): array
    {
        $this->requetes[] = compact('system', 'messages', 'outils');
        $suivante = array_shift($this->reponses) ?? asTexte('Réponse par défaut.');
        if ($suivante instanceof \Throwable) {
            throw $suivante;
        }

        return $suivante;
    }
}

function asTexte(string $texte): array
{
    return [
        'content' => [['type' => 'thinking', 'thinking' => '', 'signature' => 'sig-'.uniqid()], ['type' => 'text', 'text' => $texte]],
        'stop_reason' => 'end_turn',
        'usage' => ['input_tokens' => 100, 'output_tokens' => 20],
    ];
}

function asOutil(string $nom, array $entree, string $id = 'toolu_1'): array
{
    return [
        'content' => [['type' => 'thinking', 'thinking' => '', 'signature' => 'sig-'.uniqid()], ['type' => 'tool_use', 'id' => $id, 'name' => $nom, 'input' => $entree]],
        'stop_reason' => 'tool_use',
        'usage' => ['input_tokens' => 100, 'output_tokens' => 20],
    ];
}

function asModele(array $reponses): FauxModeleIA
{
    $modele = new FauxModeleIA($reponses);
    app()->instance(ModeleIA::class, $modele);

    return $modele;
}

function asClient(array $attributs = []): User
{
    $user = User::create([
        'name' => 'Maram Test', 'nom' => 'Test', 'prenom' => 'Maram', 'email' => uniqid('as').'@test.tn',
        'password' => 'password', 'role' => 'client', 'solde_wallet' => 40, ...$attributs,
    ]);
    Sanctum::actingAs($user);

    return $user;
}

function asBorne(array $attributs = []): Borne
{
    $borne = Borne::create([
        'nom' => 'Borne Lac 1', 'reference' => 'BRN-AS-'.uniqid(), 'adresse' => 'Les Berges du Lac, Tunis',
        'latitude' => 36.83, 'longitude' => 10.23, 'puissance_kw' => 22, 'etat' => 'disponible',
        'tarif_kwh' => 0.5, 'dernier_heartbeat' => now(), ...$attributs,
    ]);
    Connecteur::create(['borne_id' => $borne->id, 'type' => 'Type2', 'puissance_kw' => 22, 'etat' => 'disponible']);

    return $borne->load('connecteurs');
}

it('répond avec les données réelles via les outils et renvoie des cartes', function () {
    $borne = asBorne();
    asClient();
    $modele = asModele([
        asOutil('rechercher_bornes', ['lieu' => 'Tunis', 'disponible_maintenant' => true]),
        asTexte('La **Borne Lac 1** est libre maintenant.'),
    ]);

    $r = $this->postJson('/api/v1/assistant/messages', ['question' => 'Une borne libre à Tunis ?'])
        ->assertOk()
        ->assertJsonPath('message.contenu', 'La **Borne Lac 1** est libre maintenant.')
        ->assertJsonPath('message.cartes.0.type', 'borne')
        ->assertJsonPath('message.cartes.0.reference', $borne->reference)
        ->assertJsonPath('message.cartes.0.priseLibres', 1);

    expect($r->json('message.suggestions'))->not->toBeEmpty();

    // Le résultat de l'outil revient au modèle dans un seul message utilisateur.
    $deuxieme = $modele->requetes[1]['messages'];
    $resultat = end($deuxieme)['content'][0];
    expect($resultat['type'])->toBe('tool_result')
        ->and($resultat['tool_use_id'])->toBe('toolu_1')
        ->and(json_decode($resultat['content'], true)['bornes'][0]['reference'])->toBe($borne->reference);
});

it('garde un historique en ajout seul et un prompt système stable d’un tour à l’autre', function () {
    asBorne();
    asClient();
    $modele = asModele([asTexte('Bonjour !'), asTexte('Avec plaisir.')]);

    $id = $this->postJson('/api/v1/assistant/messages', ['question' => 'Salut'])->json('conversationId');
    $this->postJson('/api/v1/assistant/messages', ['question' => 'Merci', 'conversationId' => $id])->assertOk();

    [$premier, $second] = $modele->requetes;
    // Le second envoi commence exactement par tout ce qui a déjà été échangé (réflexion comprise).
    $echange = [...$premier['messages'], ['role' => 'assistant', 'content' => asTexteContenu($second['messages'][2])]];
    expect(array_slice($second['messages'], 0, 3))->toEqual(array_slice($echange, 0, 3))
        ->and($second['messages'][0])->toBe(['role' => 'user', 'content' => 'Salut'])
        ->and($second['messages'][1]['role'])->toBe('system')
        ->and($second['messages'][3])->toBe(['role' => 'user', 'content' => 'Merci'])
        ->and($second['system'])->toBe($premier['system'])
        // Outils identiques au caractère près sur le fil (préfixe de cache et de réflexion).
        ->and(json_encode($second['outils']))->toBe(json_encode($premier['outils']))
        ->and($premier['system'][0]['cache_control'])->toBe(['type' => 'ephemeral']);
});

function asTexteContenu(array $message): array
{
    return $message['content'];
}

it('limite les clients gratuits et laisse les abonnés sans limite', function () {
    config(['assistant.questions_gratuites_par_jour' => 2]);
    $user = asClient();
    asModele([]);

    $this->getJson('/api/v1/assistant/etat')->assertJsonPath('questionsRestantes', 2);
    $this->postJson('/api/v1/assistant/messages', ['question' => 'Q1'])->assertOk()->assertJsonPath('questionsRestantes', 1);
    $this->postJson('/api/v1/assistant/messages', ['question' => 'Q2'])->assertOk()->assertJsonPath('questionsRestantes', 0);
    $this->postJson('/api/v1/assistant/messages', ['question' => 'Q3'])->assertStatus(429)->assertJsonPath('quotaAtteint', true);

    $abonnement = Abonnement::create(['nom' => 'Confort', 'prix_mensuel' => 39, 'remise_pourcent' => 10, 'kwh_inclus' => 50]);
    Souscription::create(['user_id' => $user->id, 'abonnement_id' => $abonnement->id, 'date_debut' => today(), 'date_fin' => today()->addMonth(), 'statut' => 'active']);

    $this->postJson('/api/v1/assistant/messages', ['question' => 'Q3'])->assertOk()->assertJsonPath('questionsRestantes', null);
});

it('ne donne jamais accès aux conversations d’un autre client', function () {
    asClient();
    asModele([]);
    $id = $this->postJson('/api/v1/assistant/messages', ['question' => 'Mon solde ?'])->json('conversationId');

    asClient();
    $this->getJson("/api/v1/assistant/conversations/{$id}")->assertNotFound();
    $this->postJson('/api/v1/assistant/messages', ['question' => 'Suite', 'conversationId' => $id])->assertNotFound();
    $this->deleteJson("/api/v1/assistant/conversations/{$id}")->assertNotFound();
    $this->getJson('/api/v1/assistant/conversations')->assertJsonCount(0);
});

it('limite les outils du compte au client connecté', function () {
    asClient(['solde_wallet' => 12.5, 'prenom' => 'Ines']);
    User::create(['name' => 'Autre', 'nom' => 'A', 'prenom' => 'Autre', 'email' => 'autre@test.tn', 'password' => 'password', 'solde_wallet' => 999]);
    $modele = asModele([asOutil('mon_compte', []), asTexte('Votre solde est de **12,50 DT**.')]);

    $this->postJson('/api/v1/assistant/messages', ['question' => 'Mon solde ?'])
        ->assertOk()
        ->assertJsonPath('message.cartes.0.type', 'compte')
        ->assertJsonPath('message.cartes.0.soldeWallet', 12.5);

    $resultat = json_decode(end($modele->requetes[1]['messages'])['content'][0]['content'], true);
    expect($resultat['prenom'])->toBe('Ines')->and($resultat['solde_wallet'])->toBe(12.5);
});

it('estime le prix avec le tarif réel de la borne', function () {
    $borne = asBorne(['tarif_kwh' => 0.5]);
    asClient();
    asModele([asOutil('estimer_recharge', ['recherche' => $borne->reference, 'energie_kwh' => 20]), asTexte('Environ **10 DT**.')]);

    $this->postJson('/api/v1/assistant/messages', ['question' => 'Combien pour 20 kWh ?'])
        ->assertOk()
        ->assertJsonPath('message.cartes.0.type', 'estimation')
        ->assertJsonPath('message.cartes.0.prix', 10)
        ->assertJsonPath('message.cartes.0.energieKwh', 20);
});

it('signale au modèle une entrée d’outil invalide sans planter', function () {
    asClient();
    $modele = asModele([asOutil('rechercher_bornes', ['puissance_min_kw' => -5]), asTexte('Je reformule.')]);

    $this->postJson('/api/v1/assistant/messages', ['question' => 'Bornes ?'])->assertOk();

    $resultat = end($modele->requetes[1]['messages'])['content'][0];
    expect($resultat['is_error'])->toBeTrue()
        ->and($resultat['content'])->toContain('Paramètres invalides');
});

it('répond poliment quand le modèle décline la demande', function () {
    asClient();
    asModele([['content' => [], 'stop_reason' => 'refusal', 'usage' => ['input_tokens' => 10, 'output_tokens' => 0]], asTexte('OK')]);

    $id = $this->postJson('/api/v1/assistant/messages', ['question' => 'Hors sujet'])
        ->assertOk()
        ->assertJsonPath('message.contenu', fn ($t) => str_starts_with($t, 'Je ne peux pas vous aider'))
        ->json('conversationId');

    // Le tour suivant reste valide : pas de message assistant vide dans l'historique.
    $historique = ConversationAssistant::find($id)->historique;
    expect(end($historique)['content'])->not->toBeEmpty();
});

it('reprend une conversation dont la réflexion n’est plus valide après une mise à jour', function () {
    asClient();
    $modele = asModele([asTexte('Premier'), new HistoriqueIncompatible('Invalid `signature` in `thinking` block'), asTexte('Repris')]);

    $id = $this->postJson('/api/v1/assistant/messages', ['question' => 'A'])->json('conversationId');
    $this->postJson('/api/v1/assistant/messages', ['question' => 'B', 'conversationId' => $id])
        ->assertOk()->assertJsonPath('message.contenu', 'Repris');

    $reprise = end($modele->requetes)['messages'];
    $types = collect($reprise)->flatMap(fn ($m) => is_array($m['content']) ? array_column($m['content'], 'type') : []);
    expect($types)->not->toContain('thinking');
});

it('renvoie 503 et ne consomme pas de question si l’assistant est indisponible', function () {
    asClient();
    asModele([new AssistantIndisponible('L’assistant IA n’est pas encore activé sur cette plateforme.')]);

    $this->postJson('/api/v1/assistant/messages', ['question' => 'Bonjour'])
        ->assertStatus(503)
        ->assertJsonPath('message', 'L’assistant IA n’est pas encore activé sur cette plateforme.');
    $this->getJson('/api/v1/assistant/etat')->assertJsonPath('questionsRestantes', 10);
});

it('indique l’assistant désactivé en mode Claude tant qu’aucune clé n’est configurée', function () {
    config(['assistant.moteur' => 'claude', 'assistant.cle_api' => null]);
    asClient();

    $this->getJson('/api/v1/assistant/etat')->assertOk()->assertJsonPath('disponible', false);
    $this->postJson('/api/v1/assistant/messages', ['question' => 'Bonjour'])->assertStatus(503);
});

it('liste, ouvre et supprime ses conversations', function () {
    asClient();
    asModele([asTexte('Bonjour Maram.')]);
    $id = $this->postJson('/api/v1/assistant/messages', ['question' => 'Comment fonctionne la réservation ?'])->json('conversationId');

    $this->getJson('/api/v1/assistant/conversations')
        ->assertJsonPath('0.titre', 'Comment fonctionne la réservation ?')
        ->assertJsonPath('0.messages', 2);
    $this->getJson("/api/v1/assistant/conversations/{$id}")
        ->assertJsonPath('messages.0.role', 'utilisateur')
        ->assertJsonPath('messages.1.contenu', 'Bonjour Maram.')
        ->assertJsonMissingPath('historique');
    $this->deleteJson("/api/v1/assistant/conversations/{$id}")->assertOk();
    expect(ConversationAssistant::count())->toBe(0);
});

