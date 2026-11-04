<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'ocm' => [
        'key' => env('OCM_API_KEY'),
    ],

    'ocpp' => [
        'url' => env('OCPP_SERVER_URL', 'http://127.0.0.1:9221'),
        // Secret partagé API ↔ serveur OCPP. La valeur de développement est refusée en production.
        'secret' => env('OCPP_SHARED_SECRET', 'borneapp-ocpp-secret-dev'),
        'secret_dev' => 'borneapp-ocpp-secret-dev',
        // Simulateur de recharge au badge (bornes du simulateur SAP) : démonstration, jamais en production.
        'simulateur' => (bool) env('SIMULATEUR_RECHARGE', true),
        // OCPP Security Profile 1 : une borne sans mot de passe configuré est refusée.
        'exiger_mot_de_passe' => (bool) env('OCPP_EXIGER_MOT_DE_PASSE', true),
        // Intervalle de heartbeat imposé aux bornes au BootNotification (secondes).
        'intervalle_heartbeat' => (int) env('OCPP_INTERVALLE_HEARTBEAT', 30),
        // URL de supervision à configurer dans les bornes (ws://hôte:9220/ocpp).
        'url_publique' => env('OCPP_URL_PUBLIQUE', 'ws://127.0.0.1:9220/ocpp'),
    ],

    // Paiement carte : « sandbox » crédite sans débit réel (démo). Refusé en production
    // tant qu'un prestataire (Konnect / Paymee) n'est pas branché.
    'paiement' => [
        'mode' => env('PAIEMENT_MODE', 'test'),
        // Cartes bancaires (CIB, Visa, Mastercard) via la Société Monétique Tunisie.
        'clictopay' => [
            'identifiant' => env('CLICTOPAY_IDENTIFIANT'),
            'mot_de_passe' => env('CLICTOPAY_MOT_DE_PASSE'),
            'url' => env('CLICTOPAY_URL', 'https://test.clictopay.com/payment/rest/'),
        ],
        // Flouci : portefeuille Flouci et cartes bancaires tunisiennes.
        'flouci' => [
            'public' => env('FLOUCI_CLE_PUBLIQUE'),
            'prive' => env('FLOUCI_CLE_PRIVEE'),
        ],
        // Konnect : carte bancaire et e-DINAR (La Poste Tunisienne).
        'konnect' => [
            'cle' => env('KONNECT_CLE_API'),
            'portefeuille' => env('KONNECT_PORTEFEUILLE'),
            'production' => env('KONNECT_PRODUCTION', false),
        ],
        // Page vers laquelle le client revient après le paiement.
        'retour_web' => env('PAIEMENT_RETOUR_WEB', 'http://localhost:5273/espace/paiements'),
        'retour_mobile' => env('PAIEMENT_RETOUR_MOBILE', 'borneapp://paiement'),
    ],

    // Diffusion WebSocket vers le back-office via le relais du serveur OCPP (port 9222).
    'temps_reel' => [
        'actif' => env('TEMPS_REEL_ACTIF', true),
    ],

    // Connexion « Continuer avec Google » : identifiants client OAuth acceptés (iOS, Android, Web).
    'google' => [
        'client_ids' => array_values(array_unique(array_filter(array_map('trim', [
            ...explode(',', (string) env('GOOGLE_CLIENT_IDS', '')),
            (string) env('GOOGLE_WEB_CLIENT_ID', ''),
        ])))),
        // Identifiant « Application Web » : bouton Google du site (Google Identity Services).
        'web_client_id' => env('GOOGLE_WEB_CLIENT_ID'),
    ],


    // Volteo Chain : pont local vers les smart contracts (blockchain/pont.js).
    'blockchain' => [
        'url' => env('BLOCKCHAIN_PONT_URL'),
        'secret' => env('BLOCKCHAIN_PONT_SECRET', 'secret-blockchain-dev'),
    ],

];
