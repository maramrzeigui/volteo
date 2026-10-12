<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Télémétrie OCPP (MeterValues) conservée point par point : courbe de puissance.
        Schema::create('mesures_recharge', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_recharge_id')->constrained('sessions_recharge')->cascadeOnDelete();
            $table->timestamp('horodatage');
            $table->decimal('energie_kwh', 10, 3);
            $table->decimal('puissance_kw', 8, 2)->nullable();
            $table->unsignedTinyInteger('pourcentage_batterie')->nullable();
            $table->index(['session_recharge_id', 'horodatage']);
        });

        // Réservation d'une prise pour une durée limitée (OCPP ReserveNow côté borne).
        Schema::create('reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('borne_id')->constrained()->cascadeOnDelete();
            $table->foreignId('connecteur_id')->constrained('connecteurs')->cascadeOnDelete();
            $table->timestamp('expire_le');
            $table->string('statut')->default('active'); // active, utilisee, annulee, expiree
            $table->timestamps();
            $table->index(['statut', 'expire_le']);
        });

        Schema::create('favoris', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('borne_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'borne_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('favoris');
        Schema::dropIfExists('reservations');
        Schema::dropIfExists('mesures_recharge');
    }
};
