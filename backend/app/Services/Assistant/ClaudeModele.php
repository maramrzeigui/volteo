<?php

namespace App\Services\Assistant;

use Anthropic\Client;
use Anthropic\Core\Exceptions\APIConnectionException;
use Anthropic\Core\Exceptions\APIStatusException;
use Anthropic\Core\Exceptions\AuthenticationException;
use Anthropic\Core\Exceptions\BadRequestException;
use Anthropic\Core\Exceptions\PermissionDeniedException;
use Anthropic\Core\Exceptions\RateLimitException;
use Illuminate\Support\Facades\Log;

/** Implémentation Claude (SDK officiel Anthropic pour PHP). */
class ClaudeModele implements ModeleIA
{
    /** Repli automatique côté serveur si le modèle décline une demande. */
    private const BETA_REPLI = 'server-side-fallback-2026-07-01';

    public function __construct(private readonly Client $client) {}

    public function repondre(array $system, array $messages, array $outils): array
    {
        try {
            $reponse = $this->client->beta->messages->create(
                model: config('assistant.modele'),
                maxTokens: config('assistant.max_tokens'),
                system: $system,
                messages: $messages,
                thinking: ['type' => 'adaptive'],
                outputConfig: ['effort' => config('assistant.effort')],
                betas: [self::BETA_REPLI],
                fallbacks: 'default',
                // Le point du jour n'utilise aucun outil : la liste vide n'est pas envoyée.
                ...($outils === [] ? [] : ['tools' => $outils]),
            );
        } catch (BadRequestException $e) {
            // Bloc de réflexion lié à un autre préfixe (prompt ou outils mis à jour depuis) :
            // l'appelant retire les blocs de réflexion et réessaie une fois.
            if (str_contains($e->getMessage(), 'signature')) {
                throw new HistoriqueIncompatible($e->getMessage(), 0, $e);
            }
            Log::error('Assistant : requête refusée par l’API', ['message' => $e->getMessage()]);
            throw new AssistantIndisponible(precedente: $e);
        } catch (AuthenticationException|PermissionDeniedException $e) {
            Log::critical('Assistant : clé d’API Claude invalide ou sans droits', ['message' => $e->getMessage()]);
            throw new AssistantIndisponible('L’assistant IA n’est pas disponible pour le moment.', $e);
        } catch (RateLimitException $e) {
            throw new AssistantIndisponible('L’assistant est très sollicité. Réessayez dans une minute.', $e);
        } catch (APIStatusException|APIConnectionException $e) {
            Log::warning('Assistant : erreur de l’API Claude', ['message' => $e->getMessage()]);
            throw new AssistantIndisponible(precedente: $e);
        }

        // Format de l'API (snake_case) : stocké tel quel dans l'historique.
        return json_decode(json_encode($reponse), true);
    }
}
