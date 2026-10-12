<?php

namespace App\Services\Assistant;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Implémentation locale avec Ollama (ollama.com) : le modèle (Qwen 2.5 par défaut) tourne sur
 * le serveur de Volteo, les données des clients ne quittent jamais la machine.
 *
 * L'assistant travaille au format de l'API Messages (blocs text / tool_use / tool_result) :
 * ce connecteur le traduit vers l'API /api/chat d'Ollama (messages + tool_calls), puis
 * retraduit la réponse. Les outils et l'historique restent donc identiques pour tous les moteurs.
 */
class OllamaModele implements ModeleIA
{
    public function __construct(private readonly string $url, private readonly string $modele) {}

    /** Ollama répond et le modèle est installé (vérifié au plus toutes les 30 s). */
    public function estDisponible(): bool
    {
        return Cache::remember('assistant.ollama.dispo', 30, function () {
            try {
                $modeles = Http::timeout(2)->get(rtrim($this->url, '/').'/api/tags')->json('models') ?? [];
            } catch (ConnectionException) {
                return false;
            }

            return collect($modeles)->contains(fn ($m) => ($m['name'] ?? '') === $this->modele || ($m['model'] ?? '') === $this->modele);
        });
    }

    public function repondre(array $system, array $messages, array $outils): array
    {
        // Un modèle local peut mettre plusieurs dizaines de secondes (chargement en mémoire,
        // plusieurs appels d'outils) : la limite PHP par défaut (30 s) couperait la réponse.
        set_time_limit(max(180, (int) config('assistant.delai', 60) * 3));

        $corps = [
            'model' => $this->modele,
            'stream' => false,
            'messages' => $this->versOllama($system, $messages),
            // Réponses factuelles : peu de créativité, contexte large pour l'historique et les outils.
            'options' => ['temperature' => 0.3, 'num_ctx' => (int) config('assistant.ollama_contexte', 8192)],
            'keep_alive' => '30m',
        ];
        if ($outils !== []) {
            $corps['tools'] = array_map(fn (array $o) => [
                'type' => 'function',
                'function' => ['name' => $o['name'], 'description' => $o['description'] ?? '', 'parameters' => $o['input_schema'] ?? ['type' => 'object']],
            ], $outils);
        }

        try {
            $r = Http::timeout((int) config('assistant.delai', 60) * 2)->acceptJson()->post(rtrim($this->url, '/').'/api/chat', $corps);
        } catch (ConnectionException $e) {
            Log::warning('Assistant : Ollama injoignable', ['url' => $this->url, 'message' => $e->getMessage()]);
            throw new AssistantIndisponible('L’assistant IA local n’est pas démarré (Ollama).', $e);
        }

        if ($r->status() === 404 && str_contains((string) $r->body(), 'not found')) {
            Log::critical('Assistant : modèle Ollama absent', ['modele' => $this->modele]);
            throw new AssistantIndisponible("Le modèle {$this->modele} n’est pas installé (ollama pull {$this->modele}).");
        }
        if (! $r->successful()) {
            Log::warning('Assistant : erreur Ollama', ['statut' => $r->status(), 'corps' => Str::limit($r->body(), 500)]);
            throw new AssistantIndisponible;
        }

        return $this->depuisOllama($r->json());
    }

    /** Format Messages → messages Ollama (system, user, assistant + tool_calls, tool). */
    private function versOllama(array $system, array $messages): array
    {
        $sortie = [['role' => 'system', 'content' => collect($system)->pluck('text')->join("\n\n")]];
        $nomsOutils = [];

        foreach ($messages as $m) {
            $role = $m['role'];
            $contenu = $m['content'];

            if (is_string($contenu)) {
                $sortie[] = ['role' => $role, 'content' => $contenu];

                continue;
            }

            if ($role === 'assistant') {
                $texte = collect($contenu)->where('type', 'text')->pluck('text')->join("\n\n");
                $appels = [];
                foreach ($contenu as $bloc) {
                    if (($bloc['type'] ?? null) === 'tool_use') {
                        $nomsOutils[$bloc['id']] = $bloc['name'];
                        $appels[] = ['function' => ['name' => $bloc['name'], 'arguments' => (object) ($bloc['input'] ?? [])]];
                    }
                }
                $sortie[] = array_filter(['role' => 'assistant', 'content' => $texte, 'tool_calls' => $appels ?: null], fn ($v) => $v !== null);

                continue;
            }

            // Message utilisateur en blocs : résultats d'outils et éventuel texte.
            foreach ($contenu as $bloc) {
                match ($bloc['type'] ?? null) {
                    'tool_result' => $sortie[] = [
                        'role' => 'tool',
                        'tool_name' => $nomsOutils[$bloc['tool_use_id']] ?? 'outil',
                        'content' => is_string($bloc['content']) ? $bloc['content'] : json_encode($bloc['content'], JSON_UNESCAPED_UNICODE),
                    ],
                    'text' => $sortie[] = ['role' => $role, 'content' => $bloc['text']],
                    default => null,
                };
            }
        }

        return $sortie;
    }

    /** Réponse Ollama → réponse au format Messages (content, stop_reason, usage). */
    private function depuisOllama(array $json): array
    {
        $message = $json['message'] ?? [];
        // Certains modèles écrivent leur raisonnement entre <think>…</think> : jamais montré au client.
        $texte = trim(preg_replace('/<think>.*?<\/think>/s', '', (string) ($message['content'] ?? '')));
        $contenu = $texte !== '' ? [['type' => 'text', 'text' => $texte]] : [];

        foreach ($message['tool_calls'] ?? [] as $appel) {
            $arguments = $appel['function']['arguments'] ?? [];
            $contenu[] = [
                'type' => 'tool_use',
                'id' => 'toolu_'.Str::random(20),
                'name' => $appel['function']['name'] ?? '',
                'input' => is_string($arguments) ? (json_decode($arguments, true) ?? []) : (array) $arguments,
            ];
        }

        return [
            'content' => $contenu,
            'stop_reason' => collect($contenu)->contains('type', 'tool_use') ? 'tool_use' : 'end_turn',
            'usage' => ['input_tokens' => (int) ($json['prompt_eval_count'] ?? 0), 'output_tokens' => (int) ($json['eval_count'] ?? 0)],
            'model' => $json['model'] ?? $this->modele,
        ];
    }
}
