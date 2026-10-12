<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Abonnement;
use App\Models\Paiement;
use App\Models\TransactionPaiement;
use App\Services\Paiement\Paiements;
use App\Services\Paiement\TestPasserelle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

/**
 * Paiement en ligne tunisien : carte bancaire (ClicToPay / Flouci / Konnect), Flouci, e-DINAR.
 * Le navigateur est redirigé vers la page du prestataire ; au retour (et au webhook),
 * le serveur vérifie le paiement auprès du prestataire avant de créditer quoi que ce soit.
 */
class PaiementEnLigneController extends Controller
{
    public function __construct(private readonly Paiements $paiements) {}

    public function moyens(): JsonResponse
    {
        return response()->json(['moyens' => $this->paiements->moyens(), 'modeTest' => $this->paiements->modeTest()]);
    }

    public function initier(Request $request): JsonResponse
    {
        $data = $request->validate([
            'objet' => ['required', Rule::in(TransactionPaiement::OBJETS)],
            'moyen' => ['required', Rule::in(['carte', 'flouci', 'edinar'])],
            'montant' => ['required_if:objet,recharge_wallet', 'nullable', 'numeric', 'min:5', 'max:1000'],
            'paiement_id' => ['required_if:objet,reglement', 'nullable', 'integer'],
            'abonnement_id' => ['required_if:objet,abonnement', 'nullable', 'integer'],
            'canal' => ['nullable', Rule::in(['web', 'mobile'])],
        ]);
        $user = $request->user();

        [$montant, $objetId] = match ($data['objet']) {
            'recharge_wallet' => [(float) $data['montant'], null],
            'reglement' => (function () use ($data, $user) {
                $p = Paiement::where('user_id', $user->id)->where('statut', 'en_attente')->find($data['paiement_id'])
                    ?? throw ValidationException::withMessages(['paiement_id' => ['Ce paiement est déjà réglé.']]);

                return [(float) $p->montant, $p->id];
            })(),
            'abonnement' => (function () use ($data, $user) {
                abort_if($user->souscriptionActive(), 422, 'Un abonnement est déjà actif.');
                $a = Abonnement::where('actif', true)->findOrFail($data['abonnement_id']);

                return [(float) $a->prix_mensuel, $a->id];
            })(),
        };

        $t = $this->paiements->initier($user, $data['objet'], $montant, $data['moyen'], $objetId, $data['canal'] ?? 'web');

        return response()->json($t->enTableau(), 201);
    }

    /** Statut d'une transaction (sondé par l'application au retour du paiement). */
    public function statut(Request $request, string $reference): JsonResponse
    {
        $t = TransactionPaiement::where('reference', $reference)->where('user_id', $request->user()->id)->firstOrFail();

        return response()->json($this->paiements->confirmer($t)->enTableau() + ['soldeWallet' => (float) $request->user()->fresh()->solde_wallet]);
    }

    /** Retour du client depuis la page du prestataire : vérification puis renvoi vers l'application. */
    public function retour(string $reference): RedirectResponse
    {
        $t = TransactionPaiement::where('reference', $reference)->firstOrFail();
        $t = $this->paiements->confirmer($t);
        $base = $t->canal === 'mobile' ? config('services.paiement.retour_mobile') : config('services.paiement.retour_web');

        return redirect()->away($base.(str_contains($base, '?') ? '&' : '?').http_build_query(['transaction' => $t->reference, 'statut' => $t->statut]));
    }

    /** Notification serveur à serveur du prestataire : on revérifie toujours auprès de lui. */
    public function webhook(Request $request, string $passerelle): JsonResponse
    {
        $externe = $request->input('payment_id') ?? $request->input('payment_ref') ?? $request->input('paymentRef') ?? $request->input('orderId');
        $t = TransactionPaiement::where('passerelle', $passerelle)->where('reference_externe', $externe)->first();
        if ($t) {
            $this->paiements->confirmer($t);
        }

        return response()->json(['recu' => true]);
    }

    /** Page de paiement de test (aucune passerelle configurée, hors production). */
    public function pageTest(Request $request, string $reference): View|RedirectResponse
    {
        abort_unless($this->paiements->modeTest(), 404);
        $t = TransactionPaiement::where('reference', $reference)->where('passerelle', 'test')->firstOrFail();
        if ($request->isMethod('post')) {
            $resultat = match ($t->moyen) {
                'carte' => TestPasserelle::CARTES[preg_replace('/\D/', '', (string) $request->input('carte'))] ?? 'echouee',
                default => $request->input('action') === 'payer' ? 'reussie' : 'echouee',
            };
            if ($request->input('action') === 'annuler') {
                $resultat = 'echouee';
            }
            $t->update(['reponse' => array_merge($t->reponse ?? [], ['resultat_test' => $resultat])]);

            return redirect()->route('paiement.retour', ['reference' => $t->reference]);
        }

        return view('paiement-test', ['t' => $t, 'libelle' => Paiements::LIBELLES[$t->moyen]]);
    }
}
