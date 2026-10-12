<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Paiements en ligne via une passerelle tunisienne (ClicToPay, Flouci, Konnect) :
 * une ligne par tentative, confirmée uniquement après vérification auprès du prestataire.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions_paiement', function (Blueprint $table) {
            $table->id();
            $table->uuid('reference')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('objet', 20); // recharge_wallet, reglement, abonnement
            $table->unsignedBigInteger('objet_id')->nullable(); // paiement en attente ou abonnement
            $table->decimal('montant', 10, 3);
            $table->string('passerelle', 20); // clictopay, flouci, konnect, test
            $table->string('moyen', 20); // carte, flouci, edinar
            $table->string('statut', 20)->default('en_cours'); // en_cours, reussie, echouee, expiree
            $table->string('reference_externe')->nullable()->index();
            $table->text('url_paiement')->nullable();
            $table->string('canal', 10)->default('web'); // web, mobile
            $table->json('reponse')->nullable();
            $table->timestamp('confirmee_le')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions_paiement');
    }
};
