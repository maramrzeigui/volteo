<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Photo de la borne, affichée sur les cartes et la fiche de l'application. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bornes', function (Blueprint $table) {
            $table->string('photo', 255)->nullable()->after('adresse');
        });
    }

    public function down(): void
    {
        Schema::table('bornes', function (Blueprint $table) {
            $table->dropColumn('photo');
        });
    }
};
