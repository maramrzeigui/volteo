<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

it('répond avec Ollama en appelant les outils de Volteo', function () {
    config(['assistant.moteur' => 'ollama', 'assistant.ollama_url' => 'http://ollama.test', 'assistant.ollama_modele' => 'qwen2.5:7b']);
    $appels = 0;
    Http::fake([
        'ollama.test/api/tags' => Http::response(['models' => [['name' => 'qwen2.5:7b']]]),
        'ollama.test/api/chat' => function ($requete) use (&$appels) {
            $appels++;
            // 1er tour : le modèle demande l'outil « mon_compte » ; 2e tour : il répond avec le résultat.
            if ($appels === 1) {
                expect(collect($requete['tools'])->pluck('function.name'))->toContain('mon_compte');

                return Http::response(['message' => ['role' => 'assistant', 'content' => '', 'tool_calls' => [['function' => ['name' => 'mon_compte', 'arguments' => new stdClass]]]], 'prompt_eval_count' => 900, 'eval_count' => 20]);
            }
            $outil = collect($requete['messages'])->firstWhere('role', 'tool');
            expect($outil['tool_name'])->toBe('mon_compte')->and($outil['content'])->toContain('42');

            return Http::response(['message' => ['role' => 'assistant', 'content' => 'Votre solde est de 42 DT.'], 'prompt_eval_count' => 1000, 'eval_count' => 12]);
        },
    ]);
    Sanctum::actingAs(User::factory()->create(['role' => 'client', 'solde_wallet' => 42]));

    $this->getJson('/api/v1/assistant/etat')->assertOk()->assertJsonPath('disponible', true);
    $this->postJson('/api/v1/assistant/messages', ['question' => 'Quel est mon solde ?'])
        ->assertOk()->assertJsonPath('message.contenu', 'Votre solde est de 42 DT.');
    expect($appels)->toBe(2);
});

it('signale Volta indisponible quand Ollama ne tourne pas', function () {
    config(['assistant.moteur' => 'ollama', 'assistant.ollama_url' => 'http://ollama.test']);
    Http::fake(['ollama.test/*' => Http::failedConnection()]);
    Sanctum::actingAs(User::factory()->create(['role' => 'client']));

    $this->getJson('/api/v1/assistant/etat')->assertOk()->assertJsonPath('disponible', false);
});
