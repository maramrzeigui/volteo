<?php

namespace App\Services\Assistant;

/** Le modèle ne peut pas répondre (clé absente, quota du fournisseur, panne réseau…). */
class AssistantIndisponible extends \RuntimeException
{
    public function __construct(string $message = 'L’assistant est momentanément indisponible. Réessayez dans un instant.', ?\Throwable $precedente = null)
    {
        parent::__construct($message, 0, $precedente);
    }
}
