<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('nom')->after('name')->nullable();
            $table->string('prenom')->after('nom')->nullable();
            $table->string('telephone')->nullable();
            $table->string('role')->default('client'); // super_admin, exploitant, operateur, technicien, service_client, finance, client
            $table->decimal('solde_wallet', 10, 2)->default(0);
        });

        Schema::create('bornes', function (Blueprint $table) {
            $table->id();
            $table->string('nom');
            $table->string('reference')->unique();
            $table->string('numero_serie')->unique();
            $table->string('modele');
            $table->string('fabricant');
            $table->string('adresse');
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->string('version_firmware');
            $table->string('version_ocpp'); // 1.6 | 2.0.1
            $table->unsignedSmallInteger('puissance_kw');
            $table->string('etat')->default('disponible'); // disponible, occupee, hors_service, maintenance, deconnectee, defaut
            $table->timestamp('dernier_heartbeat')->nullable();
            $table->decimal('temperature_c', 5, 2)->nullable();
            $table->decimal('tarif_kwh', 8, 3)->default(0);
            $table->timestamps();
        });

        Schema::create('connecteurs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('borne_id')->constrained()->cascadeOnDelete();
            $table->string('type'); // CCS, Type2, CHAdeMO, AC, DC
            $table->unsignedSmallInteger('puissance_kw');
            $table->string('etat')->default('disponible'); // disponible, occupe, indisponible
            $table->timestamps();
        });

        Schema::create('vehicules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('marque');
            $table->string('modele');
            $table->string('immatriculation');
            $table->string('type_connecteur');
            $table->unsignedSmallInteger('capacite_batterie_kwh');
            $table->timestamps();
        });

        Schema::create('badges_rfid', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('uid')->unique();
            $table->boolean('actif')->default(true);
            $table->date('date_expiration')->nullable();
            $table->timestamps();
        });

        Schema::create('sessions_recharge', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('borne_id')->constrained();
            $table->foreignId('connecteur_id')->constrained('connecteurs');
            $table->foreignId('vehicule_id')->nullable()->constrained('vehicules')->nullOnDelete();
            $table->timestamp('date_debut');
            $table->timestamp('date_fin')->nullable();
            $table->decimal('energie_kwh', 10, 3)->default(0);
            $table->decimal('prix', 10, 2)->default(0);
            $table->string('etat')->default('en_cours'); // en_cours, en_pause, terminee, annulee
            $table->decimal('puissance_instantanee_kw', 8, 2)->nullable();
            $table->unsignedTinyInteger('pourcentage_batterie')->nullable();
            $table->string('transaction_ocpp_id')->nullable();
            $table->timestamps();
            $table->index(['borne_id', 'date_debut']);
            $table->index(['user_id', 'etat']);
        });

        Schema::create('factures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_recharge_id')->constrained('sessions_recharge')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('numero')->unique();
            $table->date('date');
            $table->decimal('montant_ttc', 10, 2);
            $table->string('chemin_pdf')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('factures');
        Schema::dropIfExists('sessions_recharge');
        Schema::dropIfExists('badges_rfid');
        Schema::dropIfExists('vehicules');
        Schema::dropIfExists('connecteurs');
        Schema::dropIfExists('bornes');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['nom', 'prenom', 'telephone', 'role', 'solde_wallet']);
        });
    }
};
