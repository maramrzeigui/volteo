<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Plateforme multi-stations : chaque société cliente (station de recharge) a ses bornes,
 * son personnel, ses tarifs et ses relevés de reversement. Le super-admin gère toutes les stations.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stations', function (Blueprint $table) {
            $table->id();
            $table->string('nom', 120);
            $table->string('raison_sociale', 160)->nullable();
            $table->string('matricule_fiscal', 40)->nullable();
            $table->string('email', 160)->nullable();
            $table->string('telephone', 30)->nullable();
            $table->string('adresse', 255)->nullable();
            $table->string('ville', 80)->nullable();
            // Part prélevée par la plateforme sur chaque recharge (en %).
            $table->decimal('commission_pct', 5, 2)->default(10);
            // Offre SaaS souscrite par la station.
            $table->string('formule', 20)->default('pro');
            $table->unsignedSmallInteger('bornes_max')->nullable();
            $table->string('statut', 20)->default('actif'); // actif | suspendu
            $table->string('motif_suspension', 255)->nullable();
            $table->date('debut_contrat')->nullable();
            $table->date('fin_contrat')->nullable();
            $table->string('rib', 40)->nullable();
            $table->string('couleur', 9)->nullable();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('station_id')->nullable()->after('role')->constrained('stations')->nullOnDelete();
        });
        Schema::table('bornes', function (Blueprint $table) {
            $table->foreignId('station_id')->nullable()->after('source')->constrained('stations')->nullOnDelete();
        });
        Schema::table('tarifs', function (Blueprint $table) {
            $table->foreignId('station_id')->nullable()->after('id')->constrained('stations')->nullOnDelete();
        });

        Schema::create('reversements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('station_id')->constrained('stations')->cascadeOnDelete();
            $table->string('periode', 7); // AAAA-MM
            $table->decimal('chiffre_affaires', 12, 3);
            $table->decimal('commission', 12, 3);
            $table->decimal('net', 12, 3);
            $table->unsignedInteger('sessions');
            $table->decimal('energie_kwh', 12, 3);
            $table->string('statut', 20)->default('paye');
            $table->string('reference', 60)->nullable();
            $table->timestamp('paye_le')->nullable();
            $table->foreignId('paye_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['station_id', 'periode']);
        });

        // Reprise de l'existant : chaque exploitant devient l'administrateur d'une station
        // regroupant ses bornes.
        foreach (DB::table('users')->where('role', 'exploitant')->get() as $exploitant) {
            $id = DB::table('stations')->insertGetId([
                'nom' => trim(($exploitant->prenom ?? '').' '.($exploitant->nom ?? '')) ?: 'Station '.$exploitant->id,
                'email' => $exploitant->email,
                'debut_contrat' => now()->toDateString(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('users')->where('id', $exploitant->id)->update(['station_id' => $id]);
            DB::table('bornes')->where('exploitant_id', $exploitant->id)->update(['station_id' => $id]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('reversements');
        foreach (['tarifs', 'bornes', 'users'] as $t) {
            Schema::table($t, function (Blueprint $table) {
                $table->dropConstrainedForeignId('station_id');
            });
        }
        Schema::dropIfExists('stations');
    }
};
