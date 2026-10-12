<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bornes', function (Blueprint $table) {
            // OCPP 1.6 Security Profile 1 : mot de passe (haché) présenté en HTTP Basic
            // par la borne à l'ouverture du WebSocket (identifiant = référence).
            $table->string('ocpp_mot_de_passe')->nullable()->after('version_ocpp');
            // Horodatage de la dernière perte de connexion WebSocket (calcul de l'état « déconnectée »).
            $table->timestamp('deconnectee_le')->nullable()->after('dernier_heartbeat');
        });

        Schema::table('sessions_recharge', function (Blueprint $table) {
            // Index du compteur d'énergie au StartTransaction (meterStart, Wh) :
            // l'énergie de la session = index courant − index de départ.
            $table->unsignedBigInteger('index_debut_wh')->nullable()->after('energie_kwh');
        });
    }

    public function down(): void
    {
        Schema::table('bornes', function (Blueprint $table) {
            $table->dropColumn(['ocpp_mot_de_passe', 'deconnectee_le']);
        });
        Schema::table('sessions_recharge', function (Blueprint $table) {
            $table->dropColumn('index_debut_wh');
        });
    }
};
