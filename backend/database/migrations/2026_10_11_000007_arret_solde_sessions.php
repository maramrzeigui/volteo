<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Recharge arrêtée automatiquement parce que le prix a atteint le solde du wallet. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sessions_recharge', function (Blueprint $table) {
            $table->boolean('arret_solde')->default(false)->after('etat');
        });
    }

    public function down(): void
    {
        Schema::table('sessions_recharge', function (Blueprint $table) {
            $table->dropColumn('arret_solde');
        });
    }
};
