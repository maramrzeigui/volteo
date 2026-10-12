<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AdminSessionResource;
use App\Models\AuditLog;
use App\Models\MesureRecharge;
use App\Models\SessionRecharge;
use App\Models\User;
use App\Services\GestionSessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** Module 5 — gestion complète des sessions de recharge. */
class AdminSessionController extends Controller
{
    public function __construct(private readonly GestionSessions $sessions) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $page = SessionRecharge::with(['borne', 'connecteur', 'user', 'vehicule', 'tarif', 'badge', 'paiement'])
            ->when($request->query('etat'), fn ($q, $etat) => $q->whereIn('etat', explode(',', $etat)))
            ->when($request->query('borne_id'), fn ($q, $id) => $q->where('borne_id', $id))
            ->when($request->query('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            ->when($request->query('vehicule_id'), fn ($q, $id) => $q->where('vehicule_id', $id))
            ->when($request->query('origine'), fn ($q, $o) => $q->where('origine', $o))
            ->when($request->query('debut'), fn ($q, $d) => $q->whereDate('date_debut', '>=', $d))
            ->when($request->query('fin'), fn ($q, $d) => $q->whereDate('date_debut', '<=', $d))
            ->when($request->query('q'), fn ($q, $t) => $q->where(fn ($w) => $w
                ->whereHas('user', fn ($u) => $u->where('nom', 'like', "%{$t}%")->orWhere('prenom', 'like', "%{$t}%")->orWhere('email', 'like', "%{$t}%"))
                ->orWhereHas('borne', fn ($b) => $b->where('nom', 'like', "%{$t}%"))
                ->orWhere('id', ctype_digit($t) ? (int) $t : 0)))
            ->orderByDesc('date_debut')
            ->paginate(min(200, (int) $request->query('par_page', 20)));

        return AdminSessionResource::collection($page);
    }

    public function show(SessionRecharge $session): JsonResponse
    {
        $session->load(['borne', 'connecteur', 'user', 'vehicule', 'tarif', 'badge', 'paiement', 'facture']);

        return response()->json([
            'session' => (new AdminSessionResource($session))->resolve(),
            'mesures' => MesureRecharge::where('session_recharge_id', $session->id)
                ->orderBy('horodatage')
                ->get()
                ->map(fn (MesureRecharge $m) => [
                    't' => $m->horodatage->toIso8601String(),
                    'energieKwh' => $m->energie_kwh,
                    'puissanceKw' => $m->puissance_kw,
                    'pourcentageBatterie' => $m->pourcentage_batterie,
                ]),
        ]);
    }

    /** Création d'une session depuis le back-office (assistance client). */
    public function store(Request $request): AdminSessionResource
    {
        $data = $request->validate([
            'userId' => ['required', 'exists:users,id'],
            'borneId' => ['required', 'exists:bornes,id'],
            'connecteurId' => ['required', 'exists:connecteurs,id'],
            'vehiculeId' => ['nullable', 'exists:vehicules,id'],
        ]);

        $session = $this->sessions->demarrer(
            User::findOrFail($data['userId']),
            (int) $data['borneId'],
            (int) $data['connecteurId'],
            $data['vehiculeId'] ?? null,
            'back_office',
        );
        AuditLog::record($request->user()->id, 'session_creee', 'session:'.$session->id, 'pour user:'.$data['userId']);

        return new AdminSessionResource($session->load(['user', 'vehicule']));
    }

    public function pause(Request $request, SessionRecharge $session): JsonResponse
    {
        $resultat = $this->sessions->mettreEnPause($session);
        AuditLog::record($request->user()->id, 'session_pause', 'session:'.$session->id);

        return response()->json(['message' => $resultat['ok'] ? 'Recharge mise en pause.' : 'Pause enregistrée — '.$resultat['message']]);
    }

    public function reprendre(Request $request, SessionRecharge $session): JsonResponse
    {
        $resultat = $this->sessions->reprendre($session);
        AuditLog::record($request->user()->id, 'session_reprise', 'session:'.$session->id);

        return response()->json(['message' => $resultat['ok'] ? 'Recharge reprise.' : 'Reprise enregistrée — '.$resultat['message']]);
    }

    public function terminer(Request $request, SessionRecharge $session): AdminSessionResource
    {
        $session = $this->sessions->terminer($session);
        AuditLog::record($request->user()->id, 'session_terminee', 'session:'.$session->id, 'arrêt depuis le back-office');

        return new AdminSessionResource($session->load(['user', 'vehicule', 'paiement']));
    }

    public function annuler(Request $request, SessionRecharge $session): AdminSessionResource
    {
        $data = $request->validate(['motif' => ['required', 'string', 'max:255']]);
        $session = $this->sessions->annuler($session, $data['motif']);
        AuditLog::record($request->user()->id, 'session_annulee', 'session:'.$session->id, $data['motif']);

        return new AdminSessionResource($session->load(['user', 'vehicule']));
    }
}
