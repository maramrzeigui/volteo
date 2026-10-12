<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\WalletController;
use App\Http\Controllers\Controller;
use App\Http\Resources\FactureResource;
use App\Http\Resources\PaiementResource;
use App\Models\AuditLog;
use App\Models\Facture;
use App\Models\Paiement;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Module 9 — paiements, paiements différés, factures et remboursements. */
class AdminPaiementController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return PaiementResource::collection(
            $this->filtrer(Paiement::with('user'), $request)
                ->orderByDesc('created_at')
                ->paginate(min(200, (int) $request->query('par_page', 20)))
        );
    }

    public function resume(Request $request): JsonResponse
    {
        $base = $this->filtrer(Paiement::query(), $request);

        return response()->json([
            'encaisse' => round((float) (clone $base)->whereIn('statut', ['paye', 'rembourse_partiel'])->where('montant', '>', 0)->where('methode', '!=', 'ajustement')->sum('montant'), 2),
            'enAttente' => round((float) (clone $base)->where('statut', 'en_attente')->sum('montant'), 2),
            'nbEnAttente' => (clone $base)->where('statut', 'en_attente')->count(),
            'rembourse' => round((float) (clone $base)->sum('montant_rembourse'), 2),
            'parMethode' => (clone $base)->where('statut', '!=', 'echoue')
                ->selectRaw('methode, COUNT(*) as n, SUM(montant) as total')
                ->groupBy('methode')
                ->get()
                ->map(fn ($l) => ['methode' => $l->methode, 'nombre' => (int) $l->n, 'total' => round((float) $l->total, 2)]),
        ]);
    }

    /**
     * Remboursement total ou partiel. Wallet → recrédité ; carte → remboursement
     * PSP (sandbox) ; rechargement de wallet → débit du wallet correspondant.
     */
    public function rembourser(Request $request, Paiement $paiement): PaiementResource
    {
        $restant = round($paiement->montant - $paiement->montant_rembourse, 2);
        $data = $request->validate([
            'montant' => ['required', 'numeric', 'gt:0', 'max:'.$restant],
            'motif' => ['required', 'string', 'max:255'],
        ]);
        abort_unless(in_array($paiement->statut, ['paye', 'rembourse_partiel'], true), 409, 'Seul un paiement encaissé peut être remboursé.');

        DB::transaction(function () use ($paiement, $data, $restant) {
            $user = User::lockForUpdate()->findOrFail($paiement->user_id);
            $montant = round((float) $data['montant'], 2);

            if ($paiement->methode === 'wallet') {
                $user->increment('solde_wallet', $montant);
            } elseif ($paiement->methode === 'topup_carte') {
                if ((float) $user->solde_wallet < $montant) {
                    throw ValidationException::withMessages(['montant' => ['Le wallet du client ne contient plus ce montant.']]);
                }
                $user->decrement('solde_wallet', $montant);
            }

            $total = $montant >= $restant;
            $paiement->update([
                'montant_rembourse' => $paiement->montant_rembourse + $montant,
                'statut' => $total ? 'rembourse' : 'rembourse_partiel',
                'motif_remboursement' => $data['motif'],
                'rembourse_le' => now(),
            ]);

            if ($total && $paiement->session_recharge_id) {
                Facture::where('session_recharge_id', $paiement->session_recharge_id)->update(['statut' => 'remboursee']);
            }
        });

        AuditLog::record($request->user()->id, 'remboursement', 'paiement:'.$paiement->id, "{$data['montant']} — {$data['motif']}");

        return new PaiementResource($paiement->fresh('user'));
    }

    /** Régularisation d'un paiement différé encaissé hors plateforme (espèces, virement). */
    public function regulariser(Request $request, Paiement $paiement): PaiementResource
    {
        abort_unless($paiement->statut === 'en_attente', 409, 'Ce paiement n\'est pas en attente.');
        $data = $request->validate(['methode' => ['required', 'in:especes,virement,carte,wallet']]);

        DB::transaction(function () use ($paiement, $data) {
            if ($data['methode'] === 'wallet') {
                $user = User::lockForUpdate()->findOrFail($paiement->user_id);
                if ((float) $user->solde_wallet < $paiement->montant) {
                    throw ValidationException::withMessages(['methode' => ['Solde du wallet insuffisant.']]);
                }
                $user->decrement('solde_wallet', $paiement->montant);
            }
            $paiement->update([
                'statut' => 'paye',
                'methode' => $data['methode'],
                'regle_le' => now(),
                'reference_psp' => $data['methode'] === 'carte' ? WalletController::referenceSandbox() : $paiement->reference_psp,
            ]);
            Facture::where('session_recharge_id', $paiement->session_recharge_id)->update(['statut' => 'payee']);
        });

        AuditLog::record($request->user()->id, 'regularisation', 'paiement:'.$paiement->id, $data['methode']);

        return new PaiementResource($paiement->fresh('user'));
    }

    public function factures(Request $request): AnonymousResourceCollection
    {
        return FactureResource::collection(
            Facture::with('user')
                ->when($request->query('statut'), fn ($q, $s) => $q->where('statut', $s))
                ->when($request->query('user_id'), fn ($q, $id) => $q->where('user_id', $id))
                ->when($request->query('debut'), fn ($q, $d) => $q->whereDate('date', '>=', $d))
                ->when($request->query('fin'), fn ($q, $d) => $q->whereDate('date', '<=', $d))
                ->when($request->query('q'), fn ($q, $t) => $q->where(fn ($w) => $w
                    ->where('numero', 'like', "%{$t}%")
                    ->orWhereHas('user', fn ($u) => $u->where('nom', 'like', "%{$t}%")->orWhere('email', 'like', "%{$t}%"))))
                ->orderByDesc('date')
                ->orderByDesc('id')
                ->paginate(min(200, (int) $request->query('par_page', 20)))
        );
    }

    private function filtrer($query, Request $request)
    {
        return $query
            ->when($request->query('statut'), fn ($q, $s) => $q->whereIn('statut', explode(',', $s)))
            ->when($request->query('methode'), fn ($q, $m) => $q->where('methode', $m))
            ->when($request->query('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            ->when($request->query('debut'), fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
            ->when($request->query('fin'), fn ($q, $d) => $q->whereDate('created_at', '<=', $d))
            ->when($request->query('q'), fn ($q, $t) => $q->whereHas('user', fn ($u) => $u
                ->where('nom', 'like', "%{$t}%")->orWhere('prenom', 'like', "%{$t}%")->orWhere('email', 'like', "%{$t}%")));
    }
}
