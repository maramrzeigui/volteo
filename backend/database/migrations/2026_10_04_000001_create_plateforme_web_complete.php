<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Modules du cahier des charges web non couverts par la v1 :
 * tarification (10), abonnements (6/9), RFID étendu (7), maintenance complète (11),
 * notifications d'alertes (12), firmware (13), documents (16), paramétrage (17),
 * matrice des permissions (§7).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('actif')->default(true)->after('role');
            $table->string('qr_token', 64)->nullable()->unique()->after('actif');
            $table->timestamp('derniere_connexion')->nullable();
        });

        // --- Module 10 : tarification ---
        Schema::create('tarifs', function (Blueprint $table) {
            $table->id();
            $table->string('nom');
            $table->string('mode'); // kwh, minute, heure, puissance
            $table->decimal('prix', 10, 4); // prix unitaire en heures pleines
            $table->decimal('prix_heures_creuses', 10, 4)->nullable();
            $table->time('heures_creuses_debut')->nullable();
            $table->time('heures_creuses_fin')->nullable();
            $table->decimal('frais_session', 8, 2)->default(0);
            $table->boolean('special')->default(false); // tarif promotionnel / événementiel
            $table->date('valide_du')->nullable();
            $table->date('valide_au')->nullable();
            $table->boolean('actif')->default(true);
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::table('bornes', function (Blueprint $table) {
            $table->foreignId('tarif_id')->nullable()->after('tarif_kwh')->constrained('tarifs')->nullOnDelete();
            $table->foreignId('tarif_special_id')->nullable()->after('tarif_id')->constrained('tarifs')->nullOnDelete();
            // Module 2 — affectation
            $table->foreignId('exploitant_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('technicien_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('site')->nullable();
        });

        Schema::table('sessions_recharge', function (Blueprint $table) {
            $table->foreignId('tarif_id')->nullable()->constrained('tarifs')->nullOnDelete();
            $table->foreignId('badge_rfid_id')->nullable()->constrained('badges_rfid')->nullOnDelete();
            $table->string('origine')->default('application'); // application, rfid, back_office
            $table->timestamp('pause_le')->nullable();
            $table->unsignedInteger('pause_secondes')->default(0);
            $table->string('motif_annulation')->nullable();
        });

        // --- Abonnements (modules 6 et 9) ---
        Schema::create('abonnements', function (Blueprint $table) {
            $table->id();
            $table->string('nom');
            $table->text('description')->nullable();
            $table->decimal('prix_mensuel', 8, 2);
            $table->unsignedTinyInteger('remise_pourcent')->default(0);
            $table->unsignedInteger('kwh_inclus')->default(0);
            $table->boolean('actif')->default(true);
            $table->timestamps();
        });

        Schema::create('souscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('abonnement_id')->constrained('abonnements')->cascadeOnDelete();
            $table->date('date_debut');
            $table->date('date_fin');
            $table->string('statut')->default('active'); // active, expiree, resiliee
            $table->boolean('renouvellement_auto')->default(true);
            $table->timestamps();
            $table->index(['user_id', 'statut']);
        });

        // --- Module 7 : RFID ---
        Schema::table('badges_rfid', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->change();
            $table->boolean('bloque')->default(false)->after('actif');
            $table->string('motif_blocage')->nullable()->after('bloque');
            $table->string('libelle')->nullable()->after('uid');
            $table->timestamp('derniere_utilisation')->nullable();
        });

        Schema::create('badge_evenements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('badge_rfid_id')->constrained('badges_rfid')->cascadeOnDelete();
            $table->foreignId('acteur_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('borne_id')->nullable()->constrained('bornes')->nullOnDelete();
            $table->string('evenement'); // creation, association, dissociation, activation, desactivation, blocage, deblocage, expiration, autorisation_acceptee, autorisation_refusee
            $table->string('details')->nullable();
            $table->timestamps();
        });

        // --- Module 9 : paiement ---
        Schema::table('paiements', function (Blueprint $table) {
            $table->foreignId('souscription_id')->nullable()->after('session_recharge_id')->constrained('souscriptions')->nullOnDelete();
            $table->decimal('montant_rembourse', 10, 2)->default(0)->after('montant');
            $table->string('motif_remboursement')->nullable();
            $table->timestamp('rembourse_le')->nullable();
            $table->timestamp('regle_le')->nullable();
        });

        Schema::table('factures', function (Blueprint $table) {
            $table->decimal('montant_ht', 10, 2)->nullable()->after('date');
            $table->decimal('taux_tva', 5, 2)->nullable()->after('montant_ht');
            $table->decimal('montant_tva', 10, 2)->nullable()->after('taux_tva');
            $table->string('statut')->default('emise'); // emise, payee, avoir
        });

        // --- Module 11 : maintenance ---
        Schema::create('pannes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('borne_id')->constrained()->cascadeOnDelete();
            $table->foreignId('connecteur_id')->nullable()->constrained('connecteurs')->nullOnDelete();
            $table->foreignId('alerte_id')->nullable()->constrained('alertes')->nullOnDelete();
            $table->foreignId('signale_par')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type'); // electrique, mecanique, logicielle, communication, connecteur, ecran, autre
            $table->string('gravite')->default('moyenne'); // faible, moyenne, elevee, critique
            $table->text('description');
            $table->string('statut')->default('ouverte'); // ouverte, en_cours, resolue
            $table->timestamp('resolue_le')->nullable();
            $table->timestamps();
        });

        Schema::table('maintenances', function (Blueprint $table) {
            $table->string('reference')->nullable()->unique()->after('id');
            $table->string('type')->default('corrective')->after('technicien_id'); // preventive, corrective
            $table->string('priorite')->default('normale')->after('type'); // basse, normale, haute, urgente
            $table->foreignId('panne_id')->nullable()->after('borne_id')->constrained('pannes')->nullOnDelete();
            $table->string('titre')->nullable()->after('priorite');
            $table->timestamp('date_debut')->nullable();
            $table->timestamp('date_fin')->nullable();
            $table->text('rapport')->nullable();
            $table->unsignedSmallInteger('periodicite_jours')->nullable(); // maintenance préventive récurrente
        });

        Schema::create('maintenance_pieces', function (Blueprint $table) {
            $table->id();
            $table->foreignId('maintenance_id')->constrained()->cascadeOnDelete();
            $table->string('designation');
            $table->string('reference')->nullable();
            $table->unsignedSmallInteger('quantite')->default(1);
            $table->decimal('cout_unitaire', 10, 2)->default(0);
            $table->timestamps();
        });

        Schema::create('maintenance_interventions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('maintenance_id')->constrained()->cascadeOnDelete();
            $table->foreignId('technicien_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('debut');
            $table->timestamp('fin')->nullable();
            $table->text('description');
            $table->timestamps();
        });

        Schema::create('maintenance_commentaires', function (Blueprint $table) {
            $table->id();
            $table->foreignId('maintenance_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('contenu');
            $table->timestamps();
        });

        // --- Module 12 : notifications des alertes ---
        Schema::table('alertes', function (Blueprint $table) {
            $table->foreignId('resolue_par')->nullable()->after('resolue_le')->constrained('users')->nullOnDelete();
            $table->foreignId('prise_en_charge_par')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::create('notifications_envoyees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('alerte_id')->nullable()->constrained('alertes')->cascadeOnDelete();
            $table->string('canal'); // email, sms, push
            $table->string('destinataire');
            $table->string('sujet');
            $table->text('contenu');
            $table->string('statut')->default('envoyee'); // envoyee, echec, desactive
            $table->string('erreur')->nullable();
            $table->timestamps();
        });

        // --- Module 13 : firmware ---
        Schema::create('firmwares', function (Blueprint $table) {
            $table->id();
            $table->string('version');
            $table->string('fabricant')->nullable();
            $table->string('modele')->nullable();
            $table->string('fichier');
            $table->string('nom_fichier');
            $table->unsignedBigInteger('taille');
            $table->string('checksum_sha256', 64);
            $table->text('notes')->nullable();
            $table->foreignId('televerse_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('deploiements_firmware', function (Blueprint $table) {
            $table->id();
            $table->foreignId('firmware_id')->constrained('firmwares')->cascadeOnDelete();
            $table->foreignId('borne_id')->constrained()->cascadeOnDelete();
            $table->string('version_precedente')->nullable();
            $table->string('statut')->default('en_attente'); // en_attente, telechargement, telecharge, installation, installe, echec
            $table->boolean('rollback')->default(false);
            $table->string('message')->nullable();
            $table->foreignId('lance_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // --- Module 16 : gestion documentaire (+ photos de maintenance, diagnostics OCPP) ---
        Schema::create('documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('borne_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('maintenance_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('type'); // notice, photo, contrat, plan, garantie, diagnostic, autre
            $table->string('titre');
            $table->string('fichier');
            $table->string('nom_fichier');
            $table->string('mime')->nullable();
            $table->unsignedBigInteger('taille')->default(0);
            $table->date('date_expiration')->nullable(); // contrats et garanties
            $table->foreignId('televerse_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // --- Module 17 : paramétrage ---
        Schema::create('parametres', function (Blueprint $table) {
            $table->string('cle')->primary();
            $table->text('valeur')->nullable();
            $table->timestamps();
        });

        // --- §7 : matrice des permissions (modifiable par le super administrateur) ---
        Schema::create('permissions_roles', function (Blueprint $table) {
            $table->id();
            $table->string('role');
            $table->string('module');
            $table->string('niveau'); // aucun, lecture, ecriture
            $table->timestamps();
            $table->unique(['role', 'module']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('permissions_roles');
        Schema::dropIfExists('parametres');
        Schema::dropIfExists('documents');
        Schema::dropIfExists('deploiements_firmware');
        Schema::dropIfExists('firmwares');
        Schema::dropIfExists('notifications_envoyees');
        Schema::table('alertes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('resolue_par');
            $table->dropConstrainedForeignId('prise_en_charge_par');
        });
        Schema::dropIfExists('maintenance_commentaires');
        Schema::dropIfExists('maintenance_interventions');
        Schema::dropIfExists('maintenance_pieces');
        Schema::table('maintenances', function (Blueprint $table) {
            $table->dropConstrainedForeignId('panne_id');
            $table->dropColumn(['reference', 'type', 'priorite', 'titre', 'date_debut', 'date_fin', 'rapport', 'periodicite_jours']);
        });
        Schema::dropIfExists('pannes');
        Schema::table('factures', function (Blueprint $table) {
            $table->dropColumn(['montant_ht', 'taux_tva', 'montant_tva', 'statut']);
        });
        Schema::table('paiements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('souscription_id');
            $table->dropColumn(['montant_rembourse', 'motif_remboursement', 'rembourse_le', 'regle_le']);
        });
        Schema::dropIfExists('badge_evenements');
        Schema::table('badges_rfid', function (Blueprint $table) {
            $table->dropColumn(['bloque', 'motif_blocage', 'libelle', 'derniere_utilisation']);
        });
        Schema::dropIfExists('souscriptions');
        Schema::dropIfExists('abonnements');
        Schema::table('sessions_recharge', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tarif_id');
            $table->dropConstrainedForeignId('badge_rfid_id');
            $table->dropColumn(['origine', 'pause_le', 'pause_secondes', 'motif_annulation']);
        });
        Schema::table('bornes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tarif_id');
            $table->dropConstrainedForeignId('tarif_special_id');
            $table->dropConstrainedForeignId('exploitant_id');
            $table->dropConstrainedForeignId('technicien_id');
            $table->dropColumn('site');
        });
        Schema::dropIfExists('tarifs');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['actif', 'qr_token', 'derniere_connexion']);
        });
    }
};
