<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assistant_conversations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('titre')->nullable();
            // Historique exact envoyé au modèle (format de l'API), en ajout seul :
            // les blocs de réflexion sont liés à la conversation qui les a produits.
            $table->json('historique');
            $table->timestamp('derniere_activite')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'derniere_activite']);
        });

        Schema::create('assistant_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('conversation_id')->constrained('assistant_conversations')->cascadeOnDelete();
            $table->string('role'); // utilisateur | assistant
            $table->text('contenu');
            $table->json('cartes')->nullable();
            $table->json('suggestions')->nullable();
            $table->boolean('erreur')->default(false);
            $table->unsignedInteger('jetons_entree')->nullable();
            $table->unsignedInteger('jetons_sortie')->nullable();
            $table->timestamps();
            $table->index(['conversation_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assistant_messages');
        Schema::dropIfExists('assistant_conversations');
    }
};
