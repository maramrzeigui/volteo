<?php

namespace App\Services\Assistant;

/**
 * Modèle de langage utilisé par l'assistant. Les messages, outils et réponses
 * sont au format de l'API Messages (clés snake_case), ce qui permet de stocker
 * l'historique tel quel et de le renvoyer à l'identique au tour suivant.
 */
interface ModeleIA
{
    /**
     * @param  list<array<string, mixed>>  $system  blocs de texte du prompt système (stables)
     * @param  list<array<string, mixed>>  $messages  historique complet, en ajout seul
     * @param  list<array<string, mixed>>  $outils  définitions des outils
     * @return array<string, mixed> réponse complète (content, stop_reason, usage…)
     *
     * @throws AssistantIndisponible
     * @throws HistoriqueIncompatible
     */
    public function repondre(array $system, array $messages, array $outils): array;
}
