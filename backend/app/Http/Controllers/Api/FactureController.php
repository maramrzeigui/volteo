<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Facture;
use App\Models\Parametre;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class FactureController extends Controller
{
    /** Génère et renvoie la facture PDF (module 9 — Factures PDF). */
    public function pdf(Request $request, Facture $facture): Response
    {
        $user = $request->user();
        abort_unless(
            $facture->user_id === $user->id || ($user->estPersonnel() && $user->peut('paiements')),
            403
        );

        $pdf = Pdf::loadView('factures.pdf', [
            'facture' => $facture,
            'user' => $facture->user,
            'session' => $facture->session()->with(['borne', 'connecteur', 'tarif'])->first(),
            'parametres' => Parametre::tous(),
        ]);

        return $pdf->download($facture->numero.'.pdf');
    }
}
