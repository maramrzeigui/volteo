<?php

use App\Http\Controllers\Api\Admin\AdminAlerteController;
use App\Http\Controllers\Api\Admin\AdminAuditController;
use App\Http\Controllers\Api\Admin\AdminBadgeController;
use App\Http\Controllers\Api\Admin\AdminBorneController;
use App\Http\Controllers\Api\Admin\AdminDocumentController;
use App\Http\Controllers\Api\Admin\AdminFirmwareController;
use App\Http\Controllers\Api\Admin\AdminMaintenanceController;
use App\Http\Controllers\Api\Admin\AdminMaStationController;
use App\Http\Controllers\Api\Admin\AdminPaiementController;
use App\Http\Controllers\Api\Admin\AdminParametreController;
use App\Http\Controllers\Api\Admin\AdminRapportController;
use App\Http\Controllers\Api\Admin\AdminSessionController;
use App\Http\Controllers\Api\Admin\AdminStationController;
use App\Http\Controllers\Api\Admin\AdminStatsController;
use App\Http\Controllers\Api\Admin\AdminTarifController;
use App\Http\Controllers\Api\Admin\AdminUserController;
use App\Http\Controllers\Api\Admin\AdminVehiculeController;
use App\Http\Controllers\Api\Admin\MessagerieStationController;
use App\Http\Controllers\Api\AssistantController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BatterieController;
use App\Http\Controllers\Api\BorneController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\FactureController;
use App\Http\Controllers\Api\FabricantBatterieController;
use App\Http\Controllers\Api\FavoriController;
use App\Http\Controllers\Api\Internal\OcppEventController;
use App\Http\Controllers\Api\PaiementEnLigneController;
use App\Http\Controllers\Api\ReservationController;
use App\Http\Controllers\Api\SessionRechargeController;
use App\Http\Controllers\Api\SimulateurRechargeController;
use App\Http\Controllers\Api\WalletController;
use App\Support\CatalogueVehicules;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // --- Public ---
    Route::middleware('throttle:10,1')->group(function () {
        Route::post('/auth/login', [AuthController::class, 'login']);
        Route::post('/auth/register', [AuthController::class, 'register']);
        Route::post('/auth/2fa/verify', [AuthController::class, 'verify2fa']);
        Route::post('/auth/google', [AuthController::class, 'google']);
        Route::post('/auth/forgot', [AuthController::class, 'forgotPassword']);
        Route::post('/auth/reset', [AuthController::class, 'resetPassword']);
    });
    Route::get('/plateforme', [AdminParametreController::class, 'public']);
    // Volteo Chain : passeport public d'une batterie, lu dans la blockchain (QR code de la batterie).
    Route::get('/batteries/{numSerie}/passeport', [BatterieController::class, 'passeport'])
        ->where('numSerie', '.*')->middleware('throttle:60,1');

    // Paiement en ligne : notification du prestataire (Flouci, Konnect, ClicToPay), revérifiée auprès de lui.
    Route::match(['get', 'post'], '/paiements/webhook/{passerelle}', [PaiementEnLigneController::class, 'webhook'])
        ->whereIn('passerelle', ['flouci', 'konnect', 'clictopay', 'test'])->name('paiement.webhook');

    // Téléchargement du firmware par la borne (URL signée, module 13).
    Route::get('/firmwares/{firmware}/telecharger', [AdminFirmwareController::class, 'telecharger'])
        ->middleware('signed')->name('firmware.telecharger');

    // --- Utilisateur authentifié (client mobile / espace client web) ---
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/paiements/moyens', [PaiementEnLigneController::class, 'moyens']);
        Route::get('/vehicules/modeles', fn () => response()->json(CatalogueVehicules::liste()));
        // Simulateur de recharge au badge (bornes du simulateur SAP, démonstration).
        Route::get('/simulateur', [SimulateurRechargeController::class, 'contexte']);
        Route::get('/simulateur/{borne}', [SimulateurRechargeController::class, 'etat']);
        Route::post('/simulateur/{borne}/{action}', [SimulateurRechargeController::class, 'action'])
            ->whereIn('action', ['badge', 'brancher', 'demarrer', 'arreter'])->middleware('throttle:60,1');
        Route::post('/paiements/en-ligne', [PaiementEnLigneController::class, 'initier'])->middleware('throttle:20,1');
        Route::get('/paiements/en-ligne/{reference}', [PaiementEnLigneController::class, 'statut']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::put('/auth/profil', [AuthController::class, 'profil']);
        Route::put('/auth/2fa', [AuthController::class, 'deuxFacteurs']);

        Route::get('/bornes', [BorneController::class, 'index']);
        Route::get('/bornes/{borne}', [BorneController::class, 'show']);

        Route::get('/sessions', [SessionRechargeController::class, 'index']);
        Route::get('/sessions/active', [SessionRechargeController::class, 'active']);
        Route::post('/sessions', [SessionRechargeController::class, 'store']);
        Route::post('/sessions/{session}/stop', [SessionRechargeController::class, 'stop']);
        Route::get('/sessions/{session}/mesures', [SessionRechargeController::class, 'mesures']);

        Route::get('/reservations/active', [ReservationController::class, 'active']);
        Route::post('/reservations', [ReservationController::class, 'store']);
        Route::delete('/reservations/{reservation}', [ReservationController::class, 'destroy']);

        Route::get('/favoris', [FavoriController::class, 'index']);
        Route::post('/favoris/{borne}', [FavoriController::class, 'store']);
        Route::delete('/favoris/{borne}', [FavoriController::class, 'destroy']);

        Route::get('/vehicules', [ClientController::class, 'vehicules']);
        Route::post('/vehicules', [ClientController::class, 'storeVehicule']);
        Route::put('/vehicules/{vehicule}', [ClientController::class, 'updateVehicule']);
        Route::delete('/vehicules/{vehicule}', [ClientController::class, 'destroyVehicule']);
        Route::get('/badges', [ClientController::class, 'badges']);
        Route::post('/badges/{badge}/bloquer', [ClientController::class, 'bloquerBadge']);
        Route::get('/factures', [ClientController::class, 'factures']);
        Route::get('/factures/{facture}/pdf', [FactureController::class, 'pdf']);
        Route::get('/stats/client', [ClientController::class, 'stats']);

        Route::get('/abonnements', [ClientController::class, 'abonnements']);
        Route::get('/souscription', [ClientController::class, 'souscription']);
        Route::post('/souscriptions', [ClientController::class, 'souscrire']);
        Route::post('/souscription/resilier', [ClientController::class, 'resilier']);

        // Assistant IA (Claude) : réponses limitées aux données du client connecté.
        Route::get('/assistant/etat', [AssistantController::class, 'etat']);
        Route::get('/assistant/trajet/villes', [AssistantController::class, 'villes']);
        Route::post('/assistant/trajet', [AssistantController::class, 'trajet'])->middleware('throttle:30,1');
        Route::get('/assistant/lieux', [AssistantController::class, 'lieux'])->middleware('throttle:60,1');
        Route::get('/assistant/lieux/point', [AssistantController::class, 'lieuAuPoint'])->middleware('throttle:60,1');
        Route::post('/assistant/messages', [AssistantController::class, 'poser'])->middleware('throttle:20,1');
        Route::get('/assistant/conversations', [AssistantController::class, 'conversations']);
        Route::get('/assistant/conversations/{id}', [AssistantController::class, 'conversation']);
        Route::delete('/assistant/conversations/{id}', [AssistantController::class, 'supprimer']);

        // Volteo Chain : batterie certifiée du conducteur (NFT).
        Route::get('/batteries', [BatterieController::class, 'index']);
        Route::post('/batteries/activer', [BatterieController::class, 'activer'])->middleware('throttle:20,1');
        Route::post('/batteries/{batterie}/ceder', [BatterieController::class, 'ceder'])->middleware('throttle:20,1');

        Route::post('/wallet/topup', [WalletController::class, 'topup']);
        Route::get('/wallet/paiements', [WalletController::class, 'paiements']);
        Route::post('/paiements/{paiement}/regler', [WalletController::class, 'regler']);
    });

    // --- Espace fabricant : création des NFT de batteries (Volteo Chain) ---
    Route::middleware(['auth:sanctum', 'role:fabricant'])->prefix('fabricant')->group(function () {
        Route::get('/batteries', [FabricantBatterieController::class, 'index']);
        Route::post('/batteries', [FabricantBatterieController::class, 'store'])->middleware('throttle:30,1');
        Route::get('/batteries/{batterie}', [FabricantBatterieController::class, 'show']);
        Route::post('/batteries/{batterie}/reessayer', [FabricantBatterieController::class, 'reessayer']);
    });

    // --- Back-office : RBAC par module (§7), lecture pour GET, écriture sinon ---
    Route::middleware(['auth:sanctum', 'perimetre'])->prefix('admin')->group(function () {
        // Plateforme multi-stations : console du super-admin et tableau de bord de chaque station.
        Route::middleware('role:super_admin')->group(function () {
            Route::get('/stations', [AdminStationController::class, 'index']);
            Route::post('/stations', [AdminStationController::class, 'store']);
            Route::get('/stations/{station}', [AdminStationController::class, 'show']);
            Route::put('/stations/{station}', [AdminStationController::class, 'update']);
            Route::post('/stations/{station}/suspendre', [AdminStationController::class, 'suspendre']);
            Route::post('/stations/{station}/reactiver', [AdminStationController::class, 'reactiver']);
            Route::post('/stations/{station}/bornes', [AdminStationController::class, 'affecterBornes']);
            Route::post('/stations/{station}/reversements', [AdminStationController::class, 'payer']);
            Route::post('/stations/{station}/personnel/{user}/mot-de-passe', [AdminStationController::class, 'nouveauMotDePasse']);
            Route::get('/stations/{station}/messages', [MessagerieStationController::class, 'filStation']);
            Route::post('/stations/{station}/messages', [MessagerieStationController::class, 'repondre']);
            Route::post('/stations-annonce', [MessagerieStationController::class, 'annonce']);
        });
        Route::get('/ma-station', [AdminMaStationController::class, 'index']);
        Route::get('/ma-station/messages', [MessagerieStationController::class, 'fil']);
        Route::post('/ma-station/messages', [MessagerieStationController::class, 'ecrire']);

        Route::middleware('permission:dashboard')->group(function () {
            Route::get('/stats', [AdminStatsController::class, 'index']);
            Route::get('/stats/series', [AdminStatsController::class, 'series']);
            Route::get('/stats/top-bornes', [AdminStatsController::class, 'topBornes']);
        });

        Route::get('/supervision', [AdminStatsController::class, 'supervision'])->middleware('permission:supervision');

        Route::middleware('permission:bornes')->group(function () {
            Route::get('/bornes', [AdminBorneController::class, 'index']);
            Route::post('/bornes', [AdminBorneController::class, 'store']);
            Route::get('/bornes/{borne}', [AdminBorneController::class, 'show']);
            Route::put('/bornes/{borne}', [AdminBorneController::class, 'update']);
            Route::delete('/bornes/{borne}', [AdminBorneController::class, 'destroy']);
            Route::post('/bornes/{borne}/reactiver', [AdminBorneController::class, 'reactiver']);
            Route::post('/bornes/{borne}/mot-de-passe-ocpp', [AdminBorneController::class, 'motDePasseOcpp']);
            Route::post('/bornes/{borne}/photo', [AdminBorneController::class, 'photo']);
            Route::delete('/bornes/{borne}/photo', [AdminBorneController::class, 'supprimerPhoto']);
            Route::get('/bornes/{borne}/historique', [AdminBorneController::class, 'historique']);
            Route::post('/bornes/{borne}/connecteurs', [AdminBorneController::class, 'storeConnecteur']);
            Route::put('/connecteurs/{connecteur}', [AdminBorneController::class, 'updateConnecteur']);
            Route::delete('/connecteurs/{connecteur}', [AdminBorneController::class, 'destroyConnecteur']);
        });
        Route::post('/bornes/{borne}/commande', [AdminBorneController::class, 'commande'])->middleware('permission:supervision');

        Route::middleware('permission:sessions')->group(function () {
            Route::get('/sessions', [AdminSessionController::class, 'index']);
            Route::post('/sessions', [AdminSessionController::class, 'store']);
            Route::get('/sessions/{session}', [AdminSessionController::class, 'show']);
            Route::post('/sessions/{session}/pause', [AdminSessionController::class, 'pause']);
            Route::post('/sessions/{session}/reprendre', [AdminSessionController::class, 'reprendre']);
            Route::post('/sessions/{session}/terminer', [AdminSessionController::class, 'terminer']);
            Route::post('/sessions/{session}/annuler', [AdminSessionController::class, 'annuler']);
        });

        // Listes légères pour les sélecteurs, accessibles à tout le personnel.
        Route::get('/utilisateurs/options', [AdminUserController::class, 'options'])->middleware('permission:dashboard');

        Route::middleware('permission:utilisateurs')->group(function () {
            Route::get('/users', [AdminUserController::class, 'index']);
            Route::post('/users', [AdminUserController::class, 'store']);
            Route::get('/users/{user}', [AdminUserController::class, 'show']);
            Route::put('/users/{user}', [AdminUserController::class, 'update']);
            Route::get('/users/{user}/historique', [AdminUserController::class, 'historique']);
            Route::post('/users/{user}/qr', [AdminUserController::class, 'regenererQr']);
            Route::post('/users/{user}/souscriptions', [AdminUserController::class, 'souscrire']);
            Route::post('/souscriptions/{souscription}/resilier', [AdminUserController::class, 'resilier']);
        });

        Route::middleware('permission:rfid')->group(function () {
            Route::get('/badges', [AdminBadgeController::class, 'index']);
            Route::post('/badges', [AdminBadgeController::class, 'store']);
            Route::put('/badges/{badge}', [AdminBadgeController::class, 'update']);
            Route::post('/badges/{badge}/bloquer', [AdminBadgeController::class, 'bloquer']);
            Route::post('/badges/{badge}/debloquer', [AdminBadgeController::class, 'debloquer']);
            Route::get('/badges/{badge}/historique', [AdminBadgeController::class, 'historique']);
        });

        Route::middleware('permission:vehicules')->group(function () {
            Route::get('/vehicules', [AdminVehiculeController::class, 'index']);
            Route::post('/vehicules', [AdminVehiculeController::class, 'store']);
            Route::put('/vehicules/{vehicule}', [AdminVehiculeController::class, 'update']);
            Route::delete('/vehicules/{vehicule}', [AdminVehiculeController::class, 'destroy']);
            Route::get('/vehicules/{vehicule}/sessions', [AdminVehiculeController::class, 'sessions']);
        });

        Route::middleware('permission:paiements')->group(function () {
            Route::get('/paiements', [AdminPaiementController::class, 'index']);
            Route::get('/paiements/resume', [AdminPaiementController::class, 'resume']);
            Route::post('/paiements/{paiement}/rembourser', [AdminPaiementController::class, 'rembourser']);
            Route::post('/paiements/{paiement}/regulariser', [AdminPaiementController::class, 'regulariser']);
            Route::get('/factures', [AdminPaiementController::class, 'factures']);
            Route::get('/factures/{facture}/pdf', [FactureController::class, 'pdf']);
            Route::post('/users/{user}/wallet', [AdminUserController::class, 'ajusterWallet']);
        });

        Route::post('/tarifs/simuler', [AdminTarifController::class, 'simuler'])->middleware('permission:tarification,lecture');
        Route::middleware('permission:tarification')->group(function () {
            Route::get('/tarifs', [AdminTarifController::class, 'index']);
            Route::post('/tarifs', [AdminTarifController::class, 'store']);
            Route::put('/tarifs/{tarif}', [AdminTarifController::class, 'update']);
            Route::delete('/tarifs/{tarif}', [AdminTarifController::class, 'destroy']);
            Route::post('/tarifs/{tarif}/affecter', [AdminTarifController::class, 'affecter']);
            Route::get('/abonnements', [AdminTarifController::class, 'abonnements']);
            Route::post('/abonnements', [AdminTarifController::class, 'storeAbonnement']);
            Route::put('/abonnements/{abonnement}', [AdminTarifController::class, 'updateAbonnement']);
            Route::get('/souscriptions', [AdminTarifController::class, 'souscriptions']);
        });

        Route::middleware('permission:maintenance')->group(function () {
            Route::get('/maintenances', [AdminMaintenanceController::class, 'index']);
            Route::post('/maintenances', [AdminMaintenanceController::class, 'store']);
            Route::get('/maintenances/{maintenance}', [AdminMaintenanceController::class, 'show']);
            Route::put('/maintenances/{maintenance}', [AdminMaintenanceController::class, 'update']);
            Route::delete('/maintenances/{maintenance}', [AdminMaintenanceController::class, 'destroy']);
            Route::post('/maintenances/{maintenance}/pieces', [AdminMaintenanceController::class, 'storePiece']);
            Route::delete('/maintenance-pieces/{piece}', [AdminMaintenanceController::class, 'destroyPiece']);
            Route::post('/maintenances/{maintenance}/interventions', [AdminMaintenanceController::class, 'storeIntervention']);
            Route::delete('/maintenance-interventions/{intervention}', [AdminMaintenanceController::class, 'destroyIntervention']);
            Route::post('/maintenances/{maintenance}/commentaires', [AdminMaintenanceController::class, 'storeCommentaire']);
            Route::post('/maintenances/{maintenance}/photos', [AdminMaintenanceController::class, 'storePhoto']);
            Route::get('/pannes', [AdminMaintenanceController::class, 'pannes']);
            Route::put('/pannes/{panne}', [AdminMaintenanceController::class, 'updatePanne']);
        });
        // Déclarer une panne est ouvert à qui gère les alertes ou la maintenance.
        Route::post('/pannes', [AdminMaintenanceController::class, 'storePanne'])->middleware('permission:alertes');

        Route::middleware('permission:alertes')->group(function () {
            Route::get('/alertes', [AdminAlerteController::class, 'index']);
            Route::put('/alertes/{alerte}/prendre-en-charge', [AdminAlerteController::class, 'prendreEnCharge']);
            Route::put('/alertes/{alerte}/resoudre', [AdminAlerteController::class, 'resoudre']);
            Route::get('/notifications', [AdminAlerteController::class, 'notifications']);
        });

        Route::middleware('permission:firmware')->group(function () {
            Route::get('/firmwares', [AdminFirmwareController::class, 'index']);
            Route::post('/firmwares', [AdminFirmwareController::class, 'store']);
            Route::delete('/firmwares/{firmware}', [AdminFirmwareController::class, 'destroy']);
            Route::post('/firmwares/{firmware}/deployer', [AdminFirmwareController::class, 'deployer']);
            Route::get('/deploiements', [AdminFirmwareController::class, 'deploiements']);
            Route::post('/deploiements/{deploiement}/rollback', [AdminFirmwareController::class, 'rollback']);
        });

        Route::middleware('permission:rapports')->group(function () {
            Route::get('/rapports/{type}', [AdminRapportController::class, 'show']);
            Route::get('/rapports/{type}/export', [AdminRapportController::class, 'export']);
        });

        Route::middleware('permission:documents')->group(function () {
            Route::get('/documents', [AdminDocumentController::class, 'index']);
            Route::post('/documents', [AdminDocumentController::class, 'store']);
            Route::get('/documents/{document}/telecharger', [AdminDocumentController::class, 'telecharger']);
            Route::delete('/documents/{document}', [AdminDocumentController::class, 'destroy']);
        });

        Route::middleware('permission:parametres')->group(function () {
            Route::get('/parametres', [AdminParametreController::class, 'index']);
            Route::put('/parametres', [AdminParametreController::class, 'update']);
            Route::post('/parametres/logo', [AdminParametreController::class, 'logo']);
            Route::post('/notifications/test', [AdminAlerteController::class, 'tester']);
            Route::get('/permissions', [AdminParametreController::class, 'permissions']);
            Route::put('/permissions', [AdminParametreController::class, 'updatePermissions']);
        });

        Route::middleware('permission:audit')->group(function () {
            Route::get('/audit', [AdminAuditController::class, 'index']);
            Route::get('/audit/export', [AdminAuditController::class, 'export']);
        });
    });

    // --- Interne : événements poussés par le serveur OCPP ---
    Route::middleware('ocpp.secret')->prefix('internal/ocpp')->group(function () {
        Route::post('/connexion', [OcppEventController::class, 'connexion']);
        Route::post('/deconnexion', [OcppEventController::class, 'deconnexion']);
        Route::post('/boot', [OcppEventController::class, 'boot']);
        Route::post('/heartbeat', [OcppEventController::class, 'heartbeat']);
        Route::post('/status', [OcppEventController::class, 'status']);
        Route::post('/authorize', [OcppEventController::class, 'autoriser']);
        Route::post('/start-transaction', [OcppEventController::class, 'startTransaction']);
        Route::post('/meter-values', [OcppEventController::class, 'meterValues']);
        Route::post('/stop-transaction', [OcppEventController::class, 'stopTransaction']);
        Route::post('/firmware-status', [OcppEventController::class, 'firmwareStatus']);
        Route::post('/diagnostics-status', [OcppEventController::class, 'diagnosticsStatus']);
        Route::post('/erreur', [OcppEventController::class, 'erreur']);
    });

    // Dépôt des diagnostics par la borne (URL signée transmise dans GetDiagnostics).
    Route::post('/internal/ocpp/diagnostics/{borne}', [OcppEventController::class, 'diagnosticsUpload'])
        ->middleware('signed')->name('ocpp.diagnostics.upload');
});
