<?php

namespace App\Services\Assistant;

/** Aucune clé d'API configurée : l'assistant est désactivé proprement. */
class ModeleNonConfigure implements ModeleIA
{
    public function repondre(array $system, array $messages, array $outils): array
    {
        throw new AssistantIndisponible('L’assistant IA n’est pas encore activé sur cette plateforme.');
    }
}
