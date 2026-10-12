<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AlerteResource;
use App\Models\Alerte;
use App\Models\AuditLog;
use App\Models\NotificationEnvoyee;
use App\Services\Notifications;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** Module 12 — alertes automatiques et notifications (email, SMS, push). */
class AdminAlerteController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return AlerteResource::collection(
            Alerte::with(['borne', 'resoluePar', 'priseEnChargePar'])
                ->withCount('notifications')
                ->when($request->has('resolue'), fn ($q) => $q->where('resolue', $request->boolean('resolue')))
                ->when($request->query('gravite'), fn ($q, $g) => $q->where('gravite', $g))
                ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
                ->when($request->query('borne_id'), fn ($q, $id) => $q->where('borne_id', $id))
                ->orderBy('resolue')
                ->orderByDesc('created_at')
                ->limit(500)
                ->get()
        );
    }

    public function prendreEnCharge(Request $request, Alerte $alerte): AlerteResource
    {
        $alerte->update(['prise_en_charge_par' => $request->user()->id]);
        AuditLog::record($request->user()->id, 'prise_en_charge', 'alerte:'.$alerte->id);

        return new AlerteResource($alerte->load(['borne', 'resoluePar', 'priseEnChargePar']));
    }

    public function resoudre(Request $request, Alerte $alerte): JsonResponse
    {
        $alerte->update(['resolue' => true, 'resolue_le' => now(), 'resolue_par' => $request->user()->id]);
        AuditLog::record($request->user()->id, 'resolution', 'alerte:'.$alerte->id, $alerte->message);

        return response()->json(['message' => 'Alerte résolue.']);
    }

    /** Journal des notifications envoyées (toutes ou pour une alerte). */
    public function notifications(Request $request): JsonResponse
    {
        return response()->json(
            NotificationEnvoyee::query()
                ->when($request->query('alerte_id'), fn ($q, $id) => $q->where('alerte_id', $id))
                ->when($request->query('canal'), fn ($q, $c) => $q->where('canal', $c))
                ->latest()
                ->limit(300)
                ->get()
                ->map(fn (NotificationEnvoyee $n) => [
                    'id' => $n->id,
                    'alerteId' => $n->alerte_id,
                    'canal' => $n->canal,
                    'destinataire' => $n->destinataire,
                    'sujet' => $n->sujet,
                    'statut' => $n->statut,
                    'erreur' => $n->erreur,
                    'date' => $n->created_at->toIso8601String(),
                ])
        );
    }

    /** Envoi d'une notification de test sur un canal (vérification du paramétrage). */
    public function tester(Request $request, Notifications $notifications): JsonResponse
    {
        $data = $request->validate([
            'canal' => ['required', 'in:email,sms,push'],
            'destinataire' => ['required_unless:canal,push', 'nullable', 'string', 'max:150'],
        ]);

        $trace = match ($data['canal']) {
            'email' => $notifications->email(null, $data['destinataire'], 'Test de notification', 'Ceci est un message de test.'),
            'sms' => $notifications->sms(null, $data['destinataire'], 'Test de notification'),
            'push' => $notifications->push(null, 'Test de notification', 'Ceci est un message de test.'),
        };

        return response()->json([
            'message' => match ($trace->statut) {
                'envoyee' => 'Notification envoyée.',
                'desactive' => 'Canal désactivé dans les paramètres.',
                default => 'Échec : '.$trace->erreur,
            },
            'statut' => $trace->statut,
        ], $trace->statut === 'echec' ? 502 : 200);
    }
}
