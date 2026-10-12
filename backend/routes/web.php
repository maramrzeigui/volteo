<?php

use App\Http\Controllers\Api\PaiementEnLigneController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Paiement en ligne : retour du client depuis la page du prestataire, et page de paiement de test.
Route::get('/paiement/retour/{reference}', [PaiementEnLigneController::class, 'retour'])->name('paiement.retour');
Route::match(['get', 'post'], '/paiement/test/{reference}', [PaiementEnLigneController::class, 'pageTest'])
    ->middleware('signed')->name('paiement.test');
