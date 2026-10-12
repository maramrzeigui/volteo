<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bornes', function (Blueprint $table) {
            // reseau : bornes de l'exploitant, pilotables en OCPP.
            // publique : bornes importées d'une source ouverte, en consultation seule.
            $table->string('source')->default('reseau')->after('id');
            $table->string('source_id')->nullable()->unique()->after('source');
            $table->string('operateur')->nullable()->after('fabricant');

            $table->string('numero_serie')->nullable()->change();
            $table->string('modele')->nullable()->change();
            $table->string('fabricant')->nullable()->change();
            $table->string('version_firmware')->nullable()->change();
            $table->string('version_ocpp')->nullable()->change();
            $table->unsignedSmallInteger('puissance_kw')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('bornes', function (Blueprint $table) {
            $table->dropColumn(['source', 'source_id', 'operateur']);
        });
    }
};
