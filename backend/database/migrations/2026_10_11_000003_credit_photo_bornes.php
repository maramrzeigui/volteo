<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Crédit de la photo (auteur et licence), affiché quand la licence l'exige. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bornes', function (Blueprint $table) {
            $table->string('photo_credit', 160)->nullable()->after('photo');
        });
    }

    public function down(): void
    {
        Schema::table('bornes', function (Blueprint $table) {
            $table->dropColumn('photo_credit');
        });
    }
};
