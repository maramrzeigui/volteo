<?php

/*
| Paramètres par défaut de la plateforme (module 17) et matrice des
| permissions initiale (§7 du cahier des charges). Les valeurs modifiées
| depuis le back-office sont stockées dans les tables `parametres` et
| `permissions_roles` et priment sur celles-ci.
*/

$E = 'ecriture';
$L = 'lecture';
$N = 'aucun';

return [

    'parametres' => [
        'plateforme_nom' => 'Volteo',
        'logo' => null,
        'devise' => 'DT',
        'tva_taux' => 19,
        'fuseau_horaire' => 'Africa/Tunis',
        'langue' => 'fr',
        'mentions_facture' => 'Volteo SARL — MF 0000000/A/M/000 — Tunis',
        'email_expediteur' => 'noreply@borneapp.tn',
        'email_alertes_destinataires' => ['exploitation@borneapp.tn'],
        'sms_actif' => false,
        'sms_fournisseur' => 'log',
        'sms_expediteur' => 'Volteo',
        'sms_api_key' => null,
        'sms_destinataires' => [],
        'push_actif' => true,
        'notifications_regles' => [
            'critique' => ['email', 'sms', 'push'],
            'warning' => ['email', 'push'],
            'info' => ['push'],
        ],
        'seuil_temperature' => 60,
        'delai_heartbeat_minutes' => 5,
        'deux_facteurs_personnel' => false,
    ],

    /** Clés sensibles jamais renvoyées en clair par l'API. */
    'parametres_secrets' => ['sms_api_key'],

    'modules' => [
        'dashboard' => 'Tableau de bord',
        'supervision' => 'Supervision temps réel',
        'bornes' => 'Bornes & connecteurs',
        'sessions' => 'Sessions de recharge',
        'utilisateurs' => 'Utilisateurs',
        'rfid' => 'Badges RFID',
        'vehicules' => 'Véhicules',
        'paiements' => 'Paiements & facturation',
        'tarification' => 'Tarification & abonnements',
        'maintenance' => 'Maintenance',
        'alertes' => 'Alertes',
        'firmware' => 'Firmware',
        'rapports' => 'Rapports',
        'documents' => 'Documents',
        'parametres' => 'Paramétrage',
        'audit' => "Journal d'audit",
    ],

    // Ordre des colonnes : dashboard, supervision, bornes, sessions, utilisateurs, rfid, vehicules,
    // paiements, tarification, maintenance, alertes, firmware, rapports, documents, parametres, audit
    'permissions' => [
        'super_admin' => array_fill_keys([
            'dashboard', 'supervision', 'bornes', 'sessions', 'utilisateurs', 'rfid', 'vehicules', 'paiements',
            'tarification', 'maintenance', 'alertes', 'firmware', 'rapports', 'documents', 'parametres', 'audit',
        ], $E),
        'exploitant' => [
            'dashboard' => $L, 'supervision' => $E, 'bornes' => $E, 'sessions' => $E, 'utilisateurs' => $E,
            'rfid' => $E, 'vehicules' => $E, 'paiements' => $E, 'tarification' => $E, 'maintenance' => $E,
            'alertes' => $E, 'firmware' => $E, 'rapports' => $L, 'documents' => $E, 'parametres' => $L, 'audit' => $L,
        ],
        'operateur' => [
            'dashboard' => $L, 'supervision' => $E, 'bornes' => $E, 'sessions' => $E, 'utilisateurs' => $L,
            'rfid' => $E, 'vehicules' => $L, 'paiements' => $N, 'tarification' => $L, 'maintenance' => $L,
            'alertes' => $E, 'firmware' => $L, 'rapports' => $L, 'documents' => $L, 'parametres' => $N, 'audit' => $N,
        ],
        'technicien' => [
            'dashboard' => $L, 'supervision' => $E, 'bornes' => $L, 'sessions' => $L, 'utilisateurs' => $N,
            'rfid' => $N, 'vehicules' => $N, 'paiements' => $N, 'tarification' => $N, 'maintenance' => $E,
            'alertes' => $E, 'firmware' => $E, 'rapports' => $N, 'documents' => $E, 'parametres' => $N, 'audit' => $N,
        ],
        'service_client' => [
            'dashboard' => $L, 'supervision' => $L, 'bornes' => $L, 'sessions' => $E, 'utilisateurs' => $E,
            'rfid' => $E, 'vehicules' => $E, 'paiements' => $L, 'tarification' => $L, 'maintenance' => $N,
            'alertes' => $L, 'firmware' => $N, 'rapports' => $N, 'documents' => $N, 'parametres' => $N, 'audit' => $N,
        ],
        'finance' => [
            'dashboard' => $L, 'supervision' => $N, 'bornes' => $L, 'sessions' => $L, 'utilisateurs' => $L,
            'rfid' => $N, 'vehicules' => $N, 'paiements' => $E, 'tarification' => $E, 'maintenance' => $N,
            'alertes' => $N, 'firmware' => $N, 'rapports' => $L, 'documents' => $L, 'parametres' => $N, 'audit' => $L,
        ],
        // Le client n'accède qu'à ses propres données (espace client) : bornes et paiements en lecture.
        'client' => [
            'dashboard' => $N, 'supervision' => $N, 'bornes' => $L, 'sessions' => $N, 'utilisateurs' => $N,
            'rfid' => $N, 'vehicules' => $N, 'paiements' => $L, 'tarification' => $N, 'maintenance' => $N,
            'alertes' => $N, 'firmware' => $N, 'rapports' => $N, 'documents' => $N, 'parametres' => $N, 'audit' => $N,
        ],
    ],
];
