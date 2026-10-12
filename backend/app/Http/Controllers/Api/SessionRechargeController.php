<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SessionRechargeResource;
use App\Models\MesureRecharge;
use App\Models\SessionRecharge;
use App\Services\GestionSessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class SessionRechargeController extends Controller
{
    public function __construct(private readonly GestionSessions $sessions) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $sessions = $request->user()->sessions()
            ->with(['borne', 'connecteur', 'paiement'])
            ->orderByDesc('date_debut')
            ->limit(100)
            ->get();

        return SessionRechargeResource::collection($sessions);
    }

    public function active(Request $request): SessionRechargeResource|Response
    {
        $session = $request->user()->sessions()
            ->with(['borne', 'connecteur'])
            ->whereIn('etat', ['en_cours', 'en_pause'])
            ->latest('date_debut')
            ->first();

        // response()->json(null) produirait "{}" : on renvoie un null JSON littéral.
        return $session
            ? new SessionRechargeResource($session)
            : response('null', 200, ['Content-Type' => 'application/json']);
    }

    /** Courbe de la recharge (MeterValues OCPP), pour le graphique en direct et l’historique. */
    public function mesures(Request $request, SessionRecharge $session): JsonResponse
    {
        abort_unless($session->user_id === $request->user()->id, 403);

        return response()->json(
            MesureRecharge::where('session_recharge_id', $session->id)
                ->orderBy('horodatage')
                ->get()
                ->map(fn (MesureRecharge $m) => [
                    't' => $m->horodatage->toIso8601String(),
                    'energieKwh' => $m->energie_kwh,
                    'puissanceKw' => $m->puissance_kw,
                    'pourcentageBatterie' => $m->pourcentage_batterie,
                ])
        );
    }

    /** Démarre une recharge et relaie un RemoteStartTransaction à la borne. */
    public function store(Request $request): SessionRechargeResource
    {
        $data = $request->validate([
            'borne_id' => ['required', 'exists:bornes,id'],
            'connecteur_id' => ['required', 'exists:connecteurs,id'],
            'vehicule_id' => ['nullable', 'exists:vehicules,id'],
        ]);

        $vehiculeId = isset($data['vehicule_id'])
            ? $request->user()->vehicules()->whereKey($data['vehicule_id'])->value('id')
            : null;

        return new SessionRechargeResource(
            $this->sessions->demarrer($request->user(), (int) $data['borne_id'], (int) $data['connecteur_id'], $vehiculeId)
        );
    }

    /**
     * Arrête la recharge (RemoteStopTransaction), calcule le prix, débite le
     * wallet (paiement différé si solde insuffisant) et émet la facture.
     */
    public function stop(Request $request, SessionRecharge $session): SessionRechargeResource
    {
        abort_unless($session->user_id === $request->user()->id, 403);

        return new SessionRechargeResource($this->sessions->terminer($session)->load('paiement'));
    }
}
