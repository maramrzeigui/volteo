<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Messagerie entre BorneApp (super-admin) et chaque station : demandes, réponses et annonces. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('messages_station', function (Blueprint $table) {
            $table->id();
            $table->foreignId('station_id')->constrained()->cascadeOnDelete();
            $table->foreignId('auteur_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('de_plateforme')->default(false);
            $table->string('categorie', 20)->default('message'); // message, demande, annonce
            $table->text('contenu');
            $table->timestamp('lu_at')->nullable();
            $table->timestamps();
            $table->index(['station_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messages_station');
    }
};
