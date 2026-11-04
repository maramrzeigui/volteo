<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Volteo Chain : batteries de véhicules électriques tracées par NFT (BatteryPassport)
 * et recharges certifiées dans la blockchain (ChargeLedger).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('batteries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fabricant_id')->constrained('users');
            $table->string('num_serie')->unique();
            $table->string('modele');
            $table->string('chimie', 20)->nullable();
            $table->unsignedSmallInteger('capacite_kwh');
            $table->string('vin', 17)->nullable()->index();
            // en_attente → creee (NFT créé, chez le fabricant) → activee (NFT transféré au client) | echec
            $table->string('statut', 20)->default('en_attente');
            $table->unsignedBigInteger('token_id')->nullable();
            $table->string('tx_creation', 66)->nullable();
            $table->text('code_activation'); // chiffré : imprimé sur la facture du client
            $table->foreignId('proprietaire_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('vehicule_id')->nullable()->unique()->constrained('vehicules')->nullOnDelete();
            $table->string('tx_transfert', 66)->nullable();
            $table->timestamp('activee_le')->nullable();
            $table->string('erreur')->nullable();
            $table->timestamps();
        });

        Schema::table('sessions_recharge', function (Blueprint $table) {
            // null : non concernée ; certifiee | refusee | echec
            $table->string('blockchain_statut', 20)->nullable();
            $table->string('blockchain_tx', 66)->nullable();
            $table->string('blockchain_erreur')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('sessions_recharge', function (Blueprint $table) {
            $table->dropColumn(['blockchain_statut', 'blockchain_tx', 'blockchain_erreur']);
        });
        Schema::dropIfExists('batteries');
    }
};
