<?php

namespace Database\Seeders;

use App\Models\Abonnement;
use App\Models\Alerte;
use App\Models\AuditLog;
use App\Models\BadgeEvenement;
use App\Models\BadgeRfid;
use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\DeploiementFirmware;
use App\Models\Document;
use App\Models\Facture;
use App\Models\Firmware;
use App\Models\Maintenance;
use App\Models\MesureRecharge;
use App\Models\NotificationEnvoyee;
use App\Models\Paiement;
use App\Models\Panne;
use App\Models\SessionRecharge;
use App\Models\Souscription;
use App\Models\Tarif;
use App\Models\User;
use App\Models\Vehicule;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        mt_srand(42);
        // Pas de diffusion temps réel ni de notifications pour les données de démonstration.
        config(['services.temps_reel.actif' => false]);

        // --- Comptes : un par rôle (mot de passe « password ») ---
        $client = User::create([
            'name' => 'Maram Rzeigui', 'nom' => 'Rzeigui', 'prenom' => 'Maram',
            'email' => 'rzprodtn@gmail.com', 'telephone' => '+216 20 000 000',
            'role' => 'client', 'solde_wallet' => 45.50, 'password' => 'password',
        ]);

        $admin = User::create([
            // Compte unique de la plateforme (super-admin).
            'name' => 'Maram Rzeigui', 'nom' => 'Rzeigui', 'prenom' => 'Maram',
            'email' => 'maram.rzeigui@esprit.tn', 'role' => 'super_admin', 'password' => '123456',
        ]);

        $personnel = [];
        foreach ([
            ['exploitant', 'Ben Salah', 'Karim', 'exploitant@borneapp.tn', '+216 22 111 111'],
            ['operateur', 'Trabelsi', 'Sana', 'operateur@borneapp.tn', '+216 22 222 222'],
            ['technicien', 'Gharbi', 'Youssef', 'technicien@borneapp.tn', '+216 22 333 333'],
            ['technicien', 'Jaziri', 'Amine', 'technicien2@borneapp.tn', '+216 22 444 444'],
            ['service_client', 'Mansouri', 'Leila', 'support@borneapp.tn', '+216 22 555 555'],
            ['finance', 'Hammami', 'Nizar', 'finance@borneapp.tn', '+216 22 666 666'],
        ] as [$role, $nom, $prenom, $email, $tel]) {
            $personnel[$email] = User::create([
                'name' => "$prenom $nom", 'nom' => $nom, 'prenom' => $prenom, 'email' => $email,
                'telephone' => $tel, 'role' => $role, 'password' => 'password',
            ]);
        }
        $exploitant = $personnel['exploitant@borneapp.tn'];
        $technicien = $personnel['technicien@borneapp.tn'];
        $technicien2 = $personnel['technicien2@borneapp.tn'];

        $clients = collect([$client]);
        foreach ([
            ['Ayari', 'Hela', 'hela.ayari@example.tn', 120.00, ['Tesla', 'Model 3', '211 TU 1203', 'CCS', 60]],
            ['Bouazizi', 'Omar', 'omar.bouazizi@example.tn', 8.20, ['Peugeot', 'e-208', '198 TU 7744', 'CCS', 50]],
            ['Chaabane', 'Rim', 'rim.chaabane@example.tn', 64.00, ['Hyundai', 'Kona Electric', '205 TU 3310', 'CCS', 64]],
            ['Dridi', 'Mehdi', 'mehdi.dridi@example.tn', 0.00, ['Nissan', 'Leaf', '187 TU 9021', 'CHAdeMO', 40]],
            ['Ferchichi', 'Ines', 'ines.ferchichi@example.tn', 33.75, ['Renault', 'Zoe', '201 TU 5567', 'Type2', 52]],
            ['Kefi', 'Sami', 'sami.kefi@example.tn', 210.00, ['BYD', 'Atto 3', '222 TU 1088', 'CCS', 60]],
        ] as [$nom, $prenom, $email, $solde, $v]) {
            $u = User::create([
                'name' => "$prenom $nom", 'nom' => $nom, 'prenom' => $prenom, 'email' => $email,
                'telephone' => '+216 9'.mt_rand(1000000, 9999999), 'role' => 'client',
                'solde_wallet' => $solde, 'password' => 'password',
            ]);
            Vehicule::create([
                'user_id' => $u->id, 'marque' => $v[0], 'modele' => $v[1], 'immatriculation' => $v[2],
                'type_connecteur' => $v[3], 'capacite_batterie_kwh' => $v[4],
            ]);
            $clients->push($u);
        }

        // --- Tarification (module 10) ---
        $tarifAc = Tarif::create([
            'nom' => 'Standard AC', 'mode' => 'kwh', 'prix' => 0.45, 'prix_heures_creuses' => 0.35,
            'heures_creuses_debut' => '22:00', 'heures_creuses_fin' => '06:00',
            'description' => 'Recharge normale, heures creuses de 22 h à 6 h.',
        ]);
        $tarifDc = Tarif::create([
            'nom' => 'Rapide DC', 'mode' => 'kwh', 'prix' => 0.70, 'prix_heures_creuses' => 0.58,
            'heures_creuses_debut' => '23:00', 'heures_creuses_fin' => '06:00', 'frais_session' => 0.50,
            'description' => 'Recharge rapide courant continu + frais de session.',
        ]);
        Tarif::create([
            'nom' => 'Stationnement-recharge', 'mode' => 'minute', 'prix' => 0.05,
            'description' => 'Facturation au temps de branchement (parkings).',
        ]);
        Tarif::create([
            'nom' => 'Forfait horaire', 'mode' => 'heure', 'prix' => 4.50,
            'description' => 'Forfait à l\'heure de recharge.',
        ]);
        Tarif::create([
            'nom' => 'Au kW souscrit', 'mode' => 'puissance', 'prix' => 0.025,
            'description' => 'Prix par kW de puissance de prise et par heure.',
        ]);
        $promo = Tarif::create([
            'nom' => 'Promo Été', 'mode' => 'kwh', 'prix' => 0.30, 'special' => true,
            'valide_du' => today()->subDays(10), 'valide_au' => today()->addDays(20),
            'description' => 'Tarif promotionnel temporaire.',
        ]);

        // --- Abonnements ---
        Abonnement::create(['nom' => 'Essentiel', 'description' => '5 % de remise sur chaque recharge.', 'prix_mensuel' => 15, 'remise_pourcent' => 5, 'kwh_inclus' => 0]);
        $confort = Abonnement::create(['nom' => 'Confort', 'description' => '50 kWh inclus puis 10 % de remise.', 'prix_mensuel' => 39, 'remise_pourcent' => 10, 'kwh_inclus' => 50]);
        $flotte = Abonnement::create(['nom' => 'Pro Flotte', 'description' => 'Pour les flottes : 200 kWh inclus, 20 % de remise.', 'prix_mensuel' => 99, 'remise_pourcent' => 20, 'kwh_inclus' => 200]);

        // --- Bornes du réseau ---
        $bornes = [
            ['nom' => 'Borne Lac 1', 'reference' => 'BRN-TUN-001', 'numero_serie' => 'SN-88412-A', 'modele' => 'Terra AC W22', 'fabricant' => 'ABB', 'adresse' => 'Rue du Lac Turkana, Les Berges du Lac, Tunis', 'site' => 'Tunis Nord', 'latitude' => 36.8324, 'longitude' => 10.2331, 'version_firmware' => '1.8.2', 'version_ocpp' => '1.6', 'puissance_kw' => 22, 'etat' => 'disponible', 'dernier_heartbeat' => now()->subSeconds(30), 'temperature_c' => 31, 'tarif_kwh' => 0.45, 'tarif_id' => $tarifAc->id, 'tarif_special_id' => $promo->id,
                'connecteurs' => [['type' => 'Type2', 'puissance_kw' => 22, 'etat' => 'disponible'], ['type' => 'Type2', 'puissance_kw' => 22, 'etat' => 'disponible']]],
            ['nom' => 'Borne Centre Urbain Nord', 'reference' => 'BRN-TUN-002', 'numero_serie' => 'SN-88413-B', 'modele' => 'Supernova 60', 'fabricant' => 'Wallbox', 'adresse' => 'Centre Urbain Nord, Tunis', 'site' => 'Tunis Nord', 'latitude' => 36.8508, 'longitude' => 10.1897, 'version_firmware' => '2.1.0', 'version_ocpp' => '2.0.1', 'puissance_kw' => 60, 'etat' => 'disponible', 'dernier_heartbeat' => now()->subSeconds(12), 'temperature_c' => 38, 'tarif_kwh' => 0.62, 'tarif_id' => $tarifDc->id,
                'connecteurs' => [['type' => 'CCS', 'puissance_kw' => 60, 'etat' => 'disponible'], ['type' => 'CHAdeMO', 'puissance_kw' => 50, 'etat' => 'disponible']]],
            ['nom' => 'Borne La Marsa Plage', 'reference' => 'BRN-TUN-003', 'numero_serie' => 'SN-88414-C', 'modele' => 'Terra 54', 'fabricant' => 'ABB', 'adresse' => 'Avenue Habib Bourguiba, La Marsa', 'site' => 'Tunis Nord', 'latitude' => 36.8781, 'longitude' => 10.3247, 'version_firmware' => '1.7.9', 'version_ocpp' => '1.6', 'puissance_kw' => 50, 'etat' => 'maintenance', 'dernier_heartbeat' => now()->subHour(), 'temperature_c' => 29, 'tarif_kwh' => 0.58, 'tarif_id' => $tarifDc->id,
                'connecteurs' => [['type' => 'CCS', 'puissance_kw' => 50, 'etat' => 'indisponible'], ['type' => 'Type2', 'puissance_kw' => 22, 'etat' => 'indisponible']]],
            ['nom' => 'Borne Sousse Corniche', 'reference' => 'BRN-SOU-001', 'numero_serie' => 'SN-91201-A', 'modele' => 'EVBox Troniq 100', 'fabricant' => 'EVBox', 'adresse' => 'Boulevard de la Corniche, Sousse', 'site' => 'Sahel', 'latitude' => 35.8256, 'longitude' => 10.6084, 'version_firmware' => '3.0.1', 'version_ocpp' => '2.0.1', 'puissance_kw' => 100, 'etat' => 'disponible', 'dernier_heartbeat' => now()->subSeconds(45), 'temperature_c' => 33, 'tarif_kwh' => 0.70, 'tarif_id' => $tarifDc->id,
                'connecteurs' => [['type' => 'CCS', 'puissance_kw' => 100, 'etat' => 'disponible'], ['type' => 'CHAdeMO', 'puissance_kw' => 62, 'etat' => 'disponible']]],
            ['nom' => 'Borne Sfax Centre', 'reference' => 'BRN-SFX-001', 'numero_serie' => 'SN-91355-D', 'modele' => 'Terra AC W7', 'fabricant' => 'ABB', 'adresse' => 'Avenue Hédi Chaker, Sfax', 'site' => 'Sud', 'latitude' => 34.7406, 'longitude' => 10.7603, 'version_firmware' => '1.8.2', 'version_ocpp' => '1.6', 'puissance_kw' => 7, 'etat' => 'deconnectee', 'dernier_heartbeat' => now()->subDay(), 'temperature_c' => null, 'tarif_kwh' => 0.40, 'tarif_id' => $tarifAc->id,
                'connecteurs' => [['type' => 'AC', 'puissance_kw' => 7, 'etat' => 'indisponible']]],
            ['nom' => 'Borne Hammamet Yasmine', 'reference' => 'BRN-NAB-001', 'numero_serie' => 'SN-92010-E', 'modele' => 'Terra 124', 'fabricant' => 'ABB', 'adresse' => 'Yasmine Hammamet, Nabeul', 'site' => 'Cap Bon', 'latitude' => 36.3725, 'longitude' => 10.5390, 'version_firmware' => '1.9.0', 'version_ocpp' => '1.6', 'puissance_kw' => 120, 'etat' => 'disponible', 'dernier_heartbeat' => now()->subSeconds(20), 'temperature_c' => 41, 'tarif_kwh' => 0.72, 'tarif_id' => $tarifDc->id,
                'connecteurs' => [['type' => 'CCS', 'puissance_kw' => 120, 'etat' => 'disponible'], ['type' => 'CCS', 'puissance_kw' => 120, 'etat' => 'disponible'], ['type' => 'Type2', 'puissance_kw' => 22, 'etat' => 'disponible']]],
            ['nom' => 'Borne Bizerte Port', 'reference' => 'BRN-BIZ-001', 'numero_serie' => 'SN-92114-F', 'modele' => 'Pulsar Plus', 'fabricant' => 'Wallbox', 'adresse' => 'Vieux Port, Bizerte', 'site' => 'Nord', 'latitude' => 37.2746, 'longitude' => 9.8739, 'version_firmware' => '5.4.1', 'version_ocpp' => '1.6', 'puissance_kw' => 22, 'etat' => 'disponible', 'dernier_heartbeat' => now()->subSeconds(50), 'temperature_c' => 27, 'tarif_kwh' => 0.45, 'tarif_id' => $tarifAc->id,
                'connecteurs' => [['type' => 'Type2', 'puissance_kw' => 22, 'etat' => 'disponible']]],
        ];

        $modelesBornes = [];
        foreach ($bornes as $data) {
            $connecteurs = $data['connecteurs'];
            unset($data['connecteurs']);
            $borne = Borne::create([...$data, 'exploitant_id' => $exploitant->id, 'technicien_id' => $data['site'] === 'Sud' || $data['site'] === 'Sahel' ? $technicien2->id : $technicien->id]);
            // Mot de passe OCPP de démonstration (Security Profile 1) : « demo-ocpp-{référence} ».
            // En exploitation : bouton « Mot de passe OCPP » de la fiche borne ou php artisan ocpp:simulateur-sap.
            $borne->forceFill(['ocpp_mot_de_passe' => 'demo-ocpp-'.$borne->reference])->save();
            foreach ($connecteurs as $conn) {
                Connecteur::create([...$conn, 'borne_id' => $borne->id]);
            }
            $modelesBornes[$borne->id] = $borne;
        }

        // --- Véhicule et badge de la cliente de démo ---
        $vehicule = Vehicule::create([
            'user_id' => $client->id, 'marque' => 'Renault', 'modele' => 'Mégane E-Tech',
            'immatriculation' => '220 TU 4521', 'type_connecteur' => 'CCS', 'capacite_batterie_kwh' => 60,
        ]);

        $badge = BadgeRfid::create(['user_id' => $client->id, 'uid' => 'A4:5F:22:9C', 'libelle' => 'Badge principal', 'actif' => true, 'date_expiration' => today()->addYear()]);
        $this->evenementBadge($badge, 'creation', $admin->id, 40);
        $this->evenementBadge($badge, 'association', $admin->id, 40, 'Maram Rzeigui');

        foreach ($clients->slice(1) as $i => $u) {
            $b = BadgeRfid::create([
                'user_id' => $u->id,
                'uid' => sprintf('%02X:%02X:%02X:%02X', mt_rand(0, 255), mt_rand(0, 255), mt_rand(0, 255), mt_rand(0, 255)),
                'libelle' => 'Badge client',
                'date_expiration' => $i === 3 ? today()->subDays(5) : today()->addMonths(mt_rand(3, 24)),
                'bloque' => $i === 4,
                'motif_blocage' => $i === 4 ? 'Perte déclarée par le client' : null,
            ]);
            $this->evenementBadge($b, 'creation', $personnel['support@borneapp.tn']->id, 30);
            if ($b->bloque) {
                $this->evenementBadge($b, 'blocage', $personnel['support@borneapp.tn']->id, 3, $b->motif_blocage);
            }
        }
        // Badges en stock, pas encore associés.
        foreach (['04:A1:B2:C3', '04:D4:E5:F6'] as $uid) {
            $this->evenementBadge(BadgeRfid::create(['uid' => $uid, 'libelle' => 'Stock agence Tunis']), 'creation', $admin->id, 15);
        }

        // --- Abonnements actifs ---
        Souscription::create(['user_id' => $client->id, 'abonnement_id' => $confort->id, 'date_debut' => today()->subDays(12), 'date_fin' => today()->subDays(12)->addMonthNoOverflow()->subDay()]);
        $kefi = $clients->firstWhere('email', 'sami.kefi@example.tn');
        Souscription::create(['user_id' => $kefi->id, 'abonnement_id' => $flotte->id, 'date_debut' => today()->subDays(3), 'date_fin' => today()->subDays(3)->addMonthNoOverflow()->subDay()]);

        // --- Historique de recharges de la cliente de démo ---
        // [jours avant, heure, borne, prise, kW, batterie début %, batterie fin %, état]
        $historiques = [
            [3, '18:40', 2, 3, 60, 22, 80, 'terminee'],
            [9, '08:15', 1, 1, 22, 35, 90, 'terminee'],
            [17, '13:05', 4, 7, 100, 18, 80, 'terminee'],
            [24, '19:30', 1, 2, 22, 50, 58, 'annulee'],
            [33, '10:12', 2, 3, 60, 30, 85, 'terminee'],
            [41, '15:05', 4, 7, 100, 12, 80, 'terminee'],
            [55, '09:00', 1, 1, 22, 40, 100, 'terminee'],
            [70, '17:45', 2, 4, 50, 25, 80, 'terminee'],
            [88, '12:20', 4, 8, 62, 20, 75, 'terminee'],
            [104, '20:10', 1, 1, 22, 30, 90, 'terminee'],
            [130, '11:30', 2, 3, 60, 15, 80, 'terminee'],
            [150, '16:00', 4, 7, 100, 20, 80, 'terminee'],
        ];
        foreach ($historiques as [$jours, $heure, $borneId, $priseId, $kw, $socDebut, $socFin, $etat]) {
            $this->creerSession($client, $vehicule, $modelesBornes[$borneId], $priseId, now()->subDays($jours)->setTimeFromTimeString($heure), $kw, $socDebut, $socFin, $etat, true);
        }

        // --- Activité réseau des 30 derniers jours (tableaux de bord, rapports) ---
        $bornesActives = collect($modelesBornes)->filter(fn ($b) => ! in_array($b->reference, ['BRN-SFX-001', 'BRN-TUN-003']))->values();
        foreach ($clients->slice(1)->values() as $u) {
            $v = $u->vehicules()->first();
            for ($n = 0; $n < mt_rand(5, 9); $n++) {
                $borne = $bornesActives[mt_rand(0, $bornesActives->count() - 1)];
                $prise = $borne->connecteurs()->inRandomOrder()->first();
                $debut = now()->subDays(mt_rand(0, 29))->setTime(mt_rand(6, 22), mt_rand(0, 59));
                if ($debut->isFuture()) {
                    $debut = now()->subHours(mt_rand(2, 6));
                }
                $socDebut = mt_rand(10, 45);
                $this->creerSession($u, $v, $borne, $prise->id, $debut, $prise->puissance_kw, $socDebut, min(100, $socDebut + mt_rand(25, 60)), mt_rand(1, 12) === 1 ? 'annulee' : 'terminee', $n > 0 || $u->solde_wallet > 0);
            }
        }

        // Recharge en cours (supervision temps réel).
        $hela = $clients->firstWhere('email', 'hela.ayari@example.tn');
        $borneCun = $modelesBornes[2];
        $priseCun = $borneCun->connecteurs()->orderBy('id')->first();
        $active = SessionRecharge::create([
            'user_id' => $hela->id, 'borne_id' => $borneCun->id, 'connecteur_id' => $priseCun->id,
            'vehicule_id' => $hela->vehicules()->value('id'), 'tarif_id' => $tarifDc->id,
            'date_debut' => now()->subMinutes(18), 'energie_kwh' => 16.4, 'prix' => 11.98, 'etat' => 'en_cours',
            'puissance_instantanee_kw' => 54.2, 'pourcentage_batterie' => 58, 'transaction_ocpp_id' => null,
        ]);
        $priseCun->update(['etat' => 'occupe']);
        $borneCun->update(['etat' => 'occupee']);
        foreach (range(0, 17, 2) as $m) {
            MesureRecharge::create([
                'session_recharge_id' => $active->id, 'horodatage' => now()->subMinutes(18 - $m),
                'energie_kwh' => round(16.4 * ($m + 1) / 18, 2), 'puissance_kw' => 52 + mt_rand(0, 40) / 10,
                'pourcentage_batterie' => 31 + (int) round(27 * $m / 17),
            ]);
        }

        // --- Alertes & notifications (module 12) ---
        $sfx = $modelesBornes[5];
        $alerteSfx = Alerte::withoutEvents(function () use ($sfx, $technicien) {
            $alerte = Alerte::create(['borne_id' => $sfx->id, 'type' => 'borne_deconnectee', 'gravite' => 'warning', 'message' => "{$sfx->nom} n'a plus émis de heartbeat depuis 5 minutes", 'created_at' => now()->subDay()]);
            Alerte::create(['borne_id' => 6, 'type' => 'surchauffe', 'gravite' => 'critique', 'message' => 'Température de 63 °C sur Borne Hammamet Yasmine', 'resolue' => true, 'resolue_le' => now()->subDays(2)->addHours(3), 'resolue_par' => $technicien->id, 'created_at' => now()->subDays(2)]);
            Alerte::create(['borne_id' => 3, 'type' => 'defaut_materiel', 'gravite' => 'critique', 'message' => 'Défaut matériel signalé par Borne La Marsa Plage (GroundFailure)', 'prise_en_charge_par' => $technicien->id, 'created_at' => now()->subDays(4)]);
            Alerte::create(['borne_id' => 7, 'type' => 'porte_ouverte', 'gravite' => 'warning', 'message' => 'Porte / trappe ouverte sur Borne Bizerte Port', 'created_at' => now()->subHours(5)]);
            Alerte::create(['borne_id' => 4, 'type' => 'erreur_ocpp', 'gravite' => 'info', 'message' => 'Erreur OCPP sur Borne Sousse Corniche : timeout MeterValues', 'resolue' => true, 'resolue_le' => now()->subDays(6), 'created_at' => now()->subDays(7)]);

            return $alerte;
        });
        foreach (Alerte::all() as $a) {
            NotificationEnvoyee::create(['alerte_id' => $a->id, 'canal' => 'email', 'destinataire' => 'exploitation@borneapp.tn', 'sujet' => "[{$a->gravite}] {$a->message}", 'contenu' => $a->message, 'statut' => 'envoyee', 'created_at' => $a->created_at]);
            NotificationEnvoyee::create(['alerte_id' => $a->id, 'canal' => 'push', 'destinataire' => 'back-office', 'sujet' => $a->message, 'contenu' => $a->message, 'statut' => 'envoyee', 'created_at' => $a->created_at]);
            if ($a->gravite === 'critique') {
                NotificationEnvoyee::create(['alerte_id' => $a->id, 'canal' => 'sms', 'destinataire' => '+216 22 333 333', 'sujet' => 'SMS', 'contenu' => $a->message, 'statut' => 'desactive', 'created_at' => $a->created_at]);
            }
        }

        // --- Maintenance (module 11) ---
        $panneMarsa = Panne::create(['borne_id' => 3, 'connecteur_id' => 5, 'alerte_id' => 3, 'signale_par' => $technicien->id, 'type' => 'electrique', 'gravite' => 'elevee', 'description' => 'Défaut d\'isolement détecté sur la prise CCS, disjoncteur différentiel déclenché.', 'statut' => 'en_cours', 'created_at' => now()->subDays(4)]);
        Panne::create(['borne_id' => $sfx->id, 'alerte_id' => $alerteSfx->id, 'signale_par' => $personnel['operateur@borneapp.tn']->id, 'type' => 'communication', 'gravite' => 'moyenne', 'description' => 'Borne injoignable : suspicion de panne du modem 4G.', 'statut' => 'ouverte', 'created_at' => now()->subHours(20)]);
        Panne::create(['borne_id' => 6, 'signale_par' => $technicien->id, 'type' => 'ecran', 'gravite' => 'faible', 'description' => 'Écran tactile peu réactif.', 'statut' => 'resolue', 'resolue_le' => now()->subDays(12), 'created_at' => now()->subDays(15)]);

        $otMarsa = Maintenance::create([
            'borne_id' => 3, 'panne_id' => $panneMarsa->id, 'technicien_id' => $technicien->id, 'type' => 'corrective',
            'priorite' => 'haute', 'titre' => 'Remplacement module de puissance CCS', 'statut' => 'en_cours',
            'description' => 'Diagnostiquer le défaut d\'isolement, remplacer le module de puissance et le câble CCS si nécessaire.',
            'date_prevue' => today()->subDays(3), 'date_debut' => now()->subDays(3)->setTime(9, 0),
        ]);
        $otMarsa->pieces()->createMany([
            ['designation' => 'Module de puissance 25 kW', 'reference' => 'ABB-PM-25', 'quantite' => 1, 'cout_unitaire' => 1850],
            ['designation' => 'Câble CCS2 5 m', 'reference' => 'CCS2-5M', 'quantite' => 1, 'cout_unitaire' => 420],
        ]);
        $otMarsa->interventions()->createMany([
            ['technicien_id' => $technicien->id, 'debut' => now()->subDays(3)->setTime(9, 0), 'fin' => now()->subDays(3)->setTime(11, 30), 'description' => 'Diagnostic : mesure d\'isolement 0,3 MΩ sur le module 2. Module commandé.'],
            ['technicien_id' => $technicien->id, 'debut' => now()->subDay()->setTime(14, 0), 'fin' => null, 'description' => 'Pose du nouveau module, tests en cours.'],
        ]);
        $otMarsa->commentaires()->createMany([
            ['user_id' => $technicien->id, 'contenu' => 'Pièce reçue ce matin, intervention planifiée cet après-midi.', 'created_at' => now()->subDay()->setTime(10, 5)],
            ['user_id' => $exploitant->id, 'contenu' => 'Merci de prévenir dès la remise en service, la borne est très demandée le week-end.', 'created_at' => now()->subDay()->setTime(10, 40)],
        ]);

        Maintenance::create(['borne_id' => 1, 'technicien_id' => $technicien->id, 'type' => 'preventive', 'priorite' => 'normale', 'titre' => 'Contrôle trimestriel', 'statut' => 'planifiee', 'description' => 'Contrôle visuel, serrage des connexions, test RCD, nettoyage des filtres.', 'date_prevue' => today()->addDays(5), 'periodicite_jours' => 90]);
        Maintenance::create(['borne_id' => 4, 'technicien_id' => $technicien2->id, 'type' => 'preventive', 'priorite' => 'normale', 'titre' => 'Contrôle semestriel DC', 'statut' => 'planifiee', 'description' => 'Contrôle des ventilateurs et du refroidissement du module DC.', 'date_prevue' => today()->addDays(12), 'periodicite_jours' => 180]);
        Maintenance::create(['borne_id' => $sfx->id, 'technicien_id' => $technicien2->id, 'type' => 'corrective', 'priorite' => 'urgente', 'titre' => 'Remplacement modem 4G', 'statut' => 'planifiee', 'description' => 'Borne hors ligne depuis 24 h, remplacer le modem et la carte SIM.', 'date_prevue' => today()->addDay()]);
        $otPasse = Maintenance::create(['borne_id' => 6, 'technicien_id' => $technicien->id, 'type' => 'corrective', 'priorite' => 'basse', 'titre' => 'Écran tactile', 'statut' => 'terminee', 'description' => 'Recalibrage de l\'écran tactile.', 'rapport' => 'Écran recalibré, mise à jour du firmware IHM.', 'date_prevue' => today()->subDays(13), 'date_debut' => now()->subDays(13)->setTime(10, 0), 'date_fin' => now()->subDays(13)->setTime(11, 15)]);
        $otPasse->pieces()->create(['designation' => 'Film de protection écran', 'quantite' => 1, 'cout_unitaire' => 35]);

        // --- Firmware (module 13) ---
        $fw = [];
        foreach ([
            ['1.8.2', 'ABB', 'Terra AC', 'Correctifs de stabilité OCPP.', 60],
            ['1.9.0', 'ABB', 'Terra AC', 'Prise en charge ISO 15118 Plug & Charge, amélioration du heartbeat.', 20],
            ['2.1.0', 'Wallbox', 'Supernova', 'Version initiale OCPP 2.0.1.', 90],
        ] as [$version, $fabricant, $modele, $notes, $jours]) {
            $nom = strtolower($fabricant)."-{$version}.bin";
            $chemin = "firmwares/{$nom}";
            $contenu = random_bytes(4096);
            Storage::put($chemin, $contenu);
            $fw[$version] = Firmware::create([
                'version' => $version, 'fabricant' => $fabricant, 'modele' => $modele, 'fichier' => $chemin,
                'nom_fichier' => $nom, 'taille' => strlen($contenu), 'checksum_sha256' => hash('sha256', $contenu),
                'notes' => $notes, 'televerse_par' => $admin->id, 'created_at' => now()->subDays($jours),
            ]);
        }
        DeploiementFirmware::create(['firmware_id' => $fw['1.9.0']->id, 'borne_id' => 6, 'version_precedente' => '1.8.2', 'statut' => 'installe', 'message' => 'Borne : Installed', 'lance_par' => $technicien->id, 'created_at' => now()->subDays(18)]);
        DeploiementFirmware::create(['firmware_id' => $fw['1.8.2']->id, 'borne_id' => 1, 'version_precedente' => '1.8.1', 'statut' => 'installe', 'message' => 'Borne : Installed', 'lance_par' => $admin->id, 'created_at' => now()->subDays(55)]);
        DeploiementFirmware::create(['firmware_id' => $fw['1.9.0']->id, 'borne_id' => 3, 'version_precedente' => '1.7.9', 'statut' => 'echec', 'message' => 'Borne : InstallationFailed', 'lance_par' => $technicien->id, 'created_at' => now()->subDays(8)]);

        // --- Documents (module 16) ---
        $this->document(1, 'notice', 'Notice d\'installation Terra AC', 'Notice d\'installation et de mise en service — ABB Terra AC W22.', null, $technicien->id);
        $this->document(1, 'contrat', 'Contrat de maintenance ABB 2026', 'Contrat de maintenance préventive et corrective — 4 visites par an.', today()->addDays(30), $admin->id);
        $this->document(2, 'garantie', 'Certificat de garantie Supernova', 'Garantie constructeur 3 ans pièces et main d\'œuvre.', today()->addMonths(20), $admin->id);
        $this->document(4, 'plan', 'Plan d\'implantation Corniche', 'Plan d\'implantation : 2 places, raccordement TGBT, chemin de câbles.', null, $exploitant->id);
        $this->document(null, 'contrat', 'Contrat de fourniture STEG', 'Contrat de fourniture d\'électricité moyenne tension — réseau Volteo.', today()->addMonths(8), $admin->id);

        // --- Journal d'audit (quelques connexions) ---
        foreach ([$admin, $exploitant, $technicien, $personnel['finance@borneapp.tn']] as $i => $u) {
            AuditLog::create(['user_id' => $u->id, 'action' => 'connexion', 'cible' => 'user:'.$u->id, 'ip' => '127.0.0.1', 'created_at' => now()->subHours(($i + 1) * 5)]);
        }

        // --- Stations clientes (multi-stations) ---
        $this->call(StationsDemoSeeder::class);

        // --- Photos réelles des bornes de démonstration ---
        $this->call(PhotosBornesSeeder::class);
    }

    /**
     * Crée une session terminée (ou annulée) avec sa courbe, son paiement et sa facture.
     */
    private function creerSession(User $user, ?Vehicule $vehicule, Borne $borne, int $priseId, $debut, int $kw, int $socDebut, int $socFin, string $etat, bool $payee): void
    {
        $capacite = $vehicule?->capacite_batterie_kwh ?? 50;
        $courbe = $this->simulerCourbe($kw, $socDebut, $etat === 'annulee' ? min($socFin, $socDebut + 8) : $socFin, $capacite);
        $energie = end($courbe)['energie'];
        $prix = $etat === 'terminee' ? round($energie * $borne->tarif_kwh, 2) : 0;

        $session = SessionRecharge::create([
            'user_id' => $user->id,
            'borne_id' => $borne->id,
            'connecteur_id' => $priseId,
            'vehicule_id' => $vehicule?->id,
            'tarif_id' => $borne->tarif_id,
            'origine' => mt_rand(1, 5) === 1 ? 'rfid' : 'application',
            'date_debut' => $debut,
            'date_fin' => $debut->copy()->addMinutes(count($courbe)),
            'energie_kwh' => $etat === 'terminee' ? $energie : 0,
            'prix' => $prix,
            'pourcentage_batterie' => $socFin,
            'etat' => $etat,
            'motif_annulation' => $etat === 'annulee' ? 'Câble mal verrouillé' : null,
        ]);

        foreach ($courbe as $minute => $point) {
            if ($minute % 3 === 0) {
                MesureRecharge::create([
                    'session_recharge_id' => $session->id,
                    'horodatage' => $debut->copy()->addMinutes($minute),
                    'energie_kwh' => $point['energie'],
                    'puissance_kw' => $point['puissance'],
                    'pourcentage_batterie' => (int) floor($point['soc']),
                ]);
            }
        }

        if ($etat === 'terminee' && $prix > 0) {
            Paiement::create([
                'user_id' => $user->id,
                'session_recharge_id' => $session->id,
                'montant' => $prix,
                'methode' => 'wallet',
                'statut' => $payee ? 'paye' : 'en_attente',
                'regle_le' => $payee ? $session->date_fin : null,
                'created_at' => $session->date_fin,
            ]);
            $ht = round($prix / 1.19, 2);
            Facture::create([
                'session_recharge_id' => $session->id,
                'user_id' => $user->id,
                'numero' => sprintf('FAC-%s-%04d', $debut->format('Y'), $session->id),
                'date' => $debut->toDateString(),
                'montant_ht' => $ht,
                'taux_tva' => 19,
                'montant_tva' => round($prix - $ht, 2),
                'montant_ttc' => $prix,
                'statut' => $payee ? 'payee' : 'emise',
            ]);
        }
    }

    private function evenementBadge(BadgeRfid $badge, string $evenement, ?int $acteur, int $joursAvant, ?string $details = null): void
    {
        BadgeEvenement::create([
            'badge_rfid_id' => $badge->id, 'acteur_id' => $acteur, 'evenement' => $evenement,
            'details' => $details, 'created_at' => now()->subDays($joursAvant),
        ]);
    }

    private function document(?int $borneId, string $type, string $titre, string $texte, $expiration, int $auteur): void
    {
        $nom = str($titre)->slug().'.pdf';
        $chemin = 'documents/'.($borneId ?? 'general').'/'.$nom;
        Storage::put($chemin, Pdf::loadHTML("<h1 style='font-family:DejaVu Sans'>{$titre}</h1><p style='font-family:DejaVu Sans'>{$texte}</p>")->output());

        Document::create([
            'borne_id' => $borneId, 'type' => $type, 'titre' => $titre, 'fichier' => $chemin, 'nom_fichier' => $nom,
            'mime' => 'application/pdf', 'taille' => Storage::size($chemin), 'date_expiration' => $expiration,
            'televerse_par' => $auteur,
        ]);
    }

    /**
     * Courbe de charge minute par minute : plateau de puissance puis décroissance
     * au-delà de 55 % (DC) ou 95 % (AC), comme sur un véhicule réel.
     *
     * @return list<array{puissance: float, energie: float, soc: float}>
     */
    private function simulerCourbe(int $kwBorne, int $socDebut, int $socFin, int $capacite): array
    {
        $ac = $kwBorne <= 22;
        $soc = $socDebut;
        $energie = 0.0;
        $points = [];

        while ($soc < $socFin && count($points) < 600) {
            $plateau = $kwBorne * ($ac ? 0.95 : 0.92);
            $seuil = $ac ? 95 : 55;
            $puissance = $soc < $seuil ? $plateau : $plateau * max(0.25, 1 - ($soc - $seuil) / 55);
            $puissance *= 0.97 + mt_rand(0, 60) / 1000;

            $energie += $puissance / 60;
            $soc += $puissance / 60 / $capacite * 100;
            $points[] = ['puissance' => round($puissance, 1), 'energie' => round($energie, 2), 'soc' => min($soc, 100)];
        }

        return $points ?: [['puissance' => 0, 'energie' => 0, 'soc' => $socDebut]];
    }
}
