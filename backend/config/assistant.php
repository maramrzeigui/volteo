<?php

/*
| Assistant IA de Volteo (Claude) : répond aux questions des clients sur
| l'application, les bornes, les tarifs et leur compte, à partir des données
| réelles de la plateforme (outils en lecture seule, limités au client connecté).
*/

return [

    // Moteur : « ollama » (modèle local, gratuit) ou « claude » (API Anthropic, clé requise).
    'moteur' => env('ASSISTANT_MOTEUR', env('ANTHROPIC_API_KEY') ? 'claude' : 'ollama'),

    // Ollama : serveur local et modèle (Qwen 2.5 7B : bon français et bon usage des outils).
    'ollama_url' => env('OLLAMA_URL', 'http://127.0.0.1:11434'),
    'ollama_modele' => env('OLLAMA_MODELE', 'qwen2.5:7b'),
    'ollama_contexte' => (int) env('OLLAMA_CONTEXTE', 8192),

    // Clé de l'API Claude. Sans clé, l'assistant répond « indisponible » (503).
    'cle_api' => env('ANTHROPIC_API_KEY'),

    // Point d'accès de l'API (vide : API Anthropic officielle). Utile derrière un proxy d'entreprise.
    'url_api' => env('ASSISTANT_URL_API'),

    'modele' => env('ASSISTANT_MODELE', 'claude-opus-5-5'),

    // Profondeur de réflexion : low | medium | high (medium = bon équilibre pour un chat avec outils).
    'effort' => env('ASSISTANT_EFFORT', 'medium'),

    'max_tokens' => (int) env('ASSISTANT_MAX_TOKENS', 8000),

    // Délai maximal d'une requête au modèle (secondes).
    'delai' => (float) env('ASSISTANT_DELAI', 60),

    // Appels d'outils enchaînés au plus par question (garde-fou de coût et de latence).
    'max_iterations' => 6,

    // Questions gratuites par jour ; illimité pour les clients abonnés.
    'questions_gratuites_par_jour' => (int) env('ASSISTANT_QUESTIONS_GRATUITES', 10),

    // Au-delà, l'assistant propose de démarrer une nouvelle conversation.
    'max_messages_par_conversation' => 80,

    // Longueur maximale d'une question.
    'longueur_max_question' => 1000,

    // Trajet Volta : consommation et comparaison avec une voiture essence.
    'kwh_aux_100_km' => 17,
    'litres_aux_100_km' => (float) env('ASSISTANT_LITRES_100_KM', 7),
    'prix_carburant_litre' => (float) env('ASSISTANT_PRIX_CARBURANT', 2.525),
    'co2_kg_par_km_thermique' => 0.16,

    // Itinéraires routiers (OSRM) et recherche de lieux (Nominatim), services OpenStreetMap.
    // Les serveurs publics conviennent au développement ; en production, utiliser une instance dédiée.
    'osrm_url' => env('ASSISTANT_OSRM_URL', 'https://router.project-osrm.org'),
    'nominatim_url' => env('ASSISTANT_NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
];
