<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AbonnementResource;
use App\Http\Resources\BadgeRfidResource;
use App\Http\Resources\FactureResource;
use App\Http\Resources\SouscriptionResource;
use App\Http\Resources\VehiculeResource;
use App\Models\Abonnement;
use App\Models\AuditLog;
use App\Models\BadgeRfid;
use App\Models\Connecteur;
use App\Models\Vehicule;
use App\Services\Abonnements;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/** Ressources du client connecté : véhicules, badges, factures, abonnement, KPIs. */
class ClientController extends Controller
{
    public function vehicules(Request $request): AnonymousResourceCollection
    {
        return VehiculeResource::collection($request->user()->vehicules);
    }

    public function storeVehicule(Request $request): VehiculeResource
    {
        $vehicule = $request->user()->vehicules()->create($this->validerVehicule($request));

        return new VehiculeResource($vehicule);
    }

    public function updateVehicule(Request $request, Vehicule $vehicule): VehiculeResource
    {
        abort_unless($vehicule->user_id === $request->user()->id, 403);
        $vehicule->update($this->validerVehicule($request));

        return new VehiculeResource($vehicule);
    }

    public function destroyVehicule(Request $request, Vehicule $vehicule): JsonResponse
    {
        abort_unless($vehicule->user_id === $request->user()->id, 403);
        $vehicule->delete();

        return response()->json(['message' => 'Véhicule supprimé.']);
    }

    public function badges(Request $request): AnonymousResourceCollection
    {
        return BadgeRfidResource::collection($request->user()->badges);
    }

    /** Déclaration de perte / vol : le client bloque lui-même son badge. */
    public function bloquerBadge(Request $request, BadgeRfid $badge): BadgeRfidResource
    {
        abort_unless($badge->user_id === $request->user()->id, 403);
        $badge->update(['bloque' => true, 'motif_blocage' => 'Perte ou vol déclaré par le client']);
        $badge->journaliser('blocage', 'Déclaré perdu par le client');

        return new BadgeRfidResource($badge);
    }

    public function factures(Request $request): AnonymousResourceCollection
    {
        return FactureResource::collection(
            $request->user()->factures()->orderByDesc('date')->get()
        );
    }

    /** Formules d'abonnement proposées. */
    public function abonnements(): AnonymousResourceCollection
    {
        return AbonnementResource::collection(Abonnement::where('actif', true)->orderBy('prix_mensuel')->get());
    }

    public function souscription(Request $request): SouscriptionResource|Response
    {
        $souscription = $request->user()->souscriptionActive();

        return $souscription
            ? new SouscriptionResource($souscription)
            : response('null', 200, ['Content-Type' => 'application/json']);
    }

    public function souscrire(Request $request, Abonnements $abonnements): SouscriptionResource
    {
        $data = $request->validate([
            'abonnement_id' => ['required', Rule::exists('abonnements', 'id')->where('actif', true)],
            'methode' => ['sometimes', 'in:wallet,carte'],
        ]);

        $souscription = $abonnements->souscrire(
            $request->user(),
            Abonnement::findOrFail($data['abonnement_id']),
            $data['methode'] ?? 'wallet',
        );

        return new SouscriptionResource($souscription->load('abonnement'));
    }

    /** Résiliation : l'abonnement reste valable jusqu'à sa date de fin, sans renouvellement. */
    public function resilier(Request $request): JsonResponse
    {
        $souscription = $request->user()->souscriptionActive();
        abort_unless($souscription, 404, 'Aucun abonnement actif.');
        $souscription->update(['renouvellement_auto' => false]);
        AuditLog::record($request->user()->id, 'resiliation_abonnement', 'souscription:'.$souscription->id);

        return response()->json(['message' => 'Renouvellement automatique désactivé.']);
    }

    /** Consommation moyenne retenue pour convertir l'énergie en autonomie. */
    private const KWH_AUX_100_KM = 17;

    public function stats(Request $request): JsonResponse
    {
        $terminees = $request->user()->sessions()->where('etat', 'terminee');

        // Six derniers mois, mois vides inclus, pour un graphique continu.
        $parMois = collect(range(5, 0))->map(function (int $recul) use ($terminees) {
            $debut = now()->startOfMonth()->subMonthsNoOverflow($recul);
            $mois = (clone $terminees)->whereBetween('date_debut', [$debut, $debut->copy()->endOfMonth()]);

            return [
                'mois' => $debut->format('Y-m'),
                'kwh' => round((float) (clone $mois)->sum('energie_kwh'), 1),
                'prix' => round((float) (clone $mois)->sum('prix'), 2),
                'sessions' => (clone $mois)->count(),
            ];
        })->values();

        $energie = (float) (clone $terminees)->sum('energie_kwh');

        return response()->json([
            'parMois' => $parMois,
            'kmAjoutes' => (int) round($energie / self::KWH_AUX_100_KM * 100),
            'kwhAux100Km' => self::KWH_AUX_100_KM,
            'sessionsTotal' => (clone $terminees)->count(),
            'energieTotaleKwh' => (float) (clone $terminees)->sum('energie_kwh'),
            'depensesTotal' => (float) (clone $terminees)->sum('prix'),
            'dureeMoyenneMinutes' => (int) round(
                ((clone $terminees)->selectRaw('AVG(TIMESTAMPDIFF(MINUTE, date_debut, date_fin)) as m')->value('m')) ?? 0
            ),
        ]);
    }

    private function validerVehicule(Request $request): array
    {
        $data = $request->validate([
            'marque' => ['required', 'string', 'max:60'],
            'modele' => ['required', 'string', 'max:60'],
            'immatriculation' => ['required', 'string', 'max:20'],
            'typeConnecteur' => ['required', Rule::in(Connecteur::TYPES)],
            'capaciteBatterieKwh' => ['required', 'integer', 'min:1', 'max:300'],
        ]);

        return [
            'marque' => $data['marque'],
            'modele' => $data['modele'],
            'immatriculation' => strtoupper($data['immatriculation']),
            'type_connecteur' => $data['typeConnecteur'],
            'capacite_batterie_kwh' => $data['capaciteBatterieKwh'],
        ];
    }
}
