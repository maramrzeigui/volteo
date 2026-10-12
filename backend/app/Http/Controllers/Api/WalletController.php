<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaiementResource;
use App\Models\AuditLog;
use App\Models\Facture;
use App\Models\Paiement;
use App\Services\Paiement\Paiements;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class WalletController extends Controller
{
    /**
     * Recharge du wallet. En mode sandbox le crédit est immédiat ; en
     * production ce point d'entrée initiera un paiement carte via un PSP
     * (Konnect / Paymee) et le crédit arrivera par webhook de confirmation.
     */
    public function topup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'montant' => ['required', 'numeric', 'min:1', 'max:1000'],
        ]);

        self::verifierPaiementCarteDisponible();
        $montant = round((float) $data['montant'], 2);

        $solde = DB::transaction(function () use ($request, $montant) {
            $user = $request->user();
            $user->increment('solde_wallet', $montant);

            Paiement::create([
                'user_id' => $user->id,
                'montant' => $montant,
                'methode' => 'topup_carte',
                'statut' => 'paye',
                'regle_le' => now(),
                'reference_psp' => self::referenceSandbox(),
            ]);

            return (float) $user->fresh()->solde_wallet;
        });

        AuditLog::record($request->user()->id, 'recharge_wallet', 'user:'.$request->user()->id, "+{$montant}");

        return response()->json(['soldeWallet' => $solde]);
    }

    /** Historique des paiements du client. */
    public function paiements(Request $request): AnonymousResourceCollection
    {
        return PaiementResource::collection(
            $request->user()->paiements()->orderByDesc('created_at')->limit(100)->get()
        );
    }

    /** Règlement d'un paiement différé (solde insuffisant en fin de recharge). */
    public function regler(Request $request, Paiement $paiement): JsonResponse
    {
        abort_unless($paiement->user_id === $request->user()->id, 403);
        abort_unless($paiement->statut === 'en_attente', 409, 'Ce paiement est déjà réglé.');
        $data = $request->validate(['methode' => ['required', 'in:wallet,carte']]);
        if ($data['methode'] === 'carte') {
            self::verifierPaiementCarteDisponible();
        }

        DB::transaction(function () use ($request, &$paiement, $data) {
            // Verrou + relecture : deux règlements simultanés ne débitent qu'une fois.
            $paiement = Paiement::lockForUpdate()->findOrFail($paiement->id);
            abort_unless($paiement->statut === 'en_attente', 409, 'Ce paiement est déjà réglé.');
            $user = $request->user()->newQuery()->lockForUpdate()->find($request->user()->id);

            if ($data['methode'] === 'wallet') {
                if ((float) $user->solde_wallet < $paiement->montant) {
                    throw ValidationException::withMessages(['methode' => ['Solde du wallet insuffisant.']]);
                }
                $user->decrement('solde_wallet', $paiement->montant);
            }

            $paiement->update([
                'statut' => 'paye',
                'methode' => $data['methode'],
                'regle_le' => now(),
                'reference_psp' => $data['methode'] === 'carte' ? self::referenceSandbox() : null,
            ]);
            Facture::where('session_recharge_id', $paiement->session_recharge_id)->update(['statut' => 'payee']);
        });

        AuditLog::record($request->user()->id, 'reglement_differe', 'paiement:'.$paiement->id, "{$paiement->montant} via {$data['methode']}");

        return response()->json(['message' => 'Paiement réglé.', 'soldeWallet' => (float) $request->user()->fresh()->solde_wallet]);
    }

    /** Le mode sandbox (crédit sans débit réel) n'est jamais actif en production. */
    public static function verifierPaiementCarteDisponible(): void
    {
        // Hors mode test, la carte passe obligatoirement par une passerelle (POST /paiements/en-ligne).
        abort_unless(
            app(Paiements::class)->modeTest(),
            409,
            'Payez par carte bancaire, Flouci ou e-DINAR depuis l’écran de paiement.'
        );
    }

    public static function referenceSandbox(): string
    {
        return 'SANDBOX-'.strtoupper(bin2hex(random_bytes(5)));
    }
}
