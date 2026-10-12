<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Borne;
use App\Models\MessageStation;
use App\Models\SessionRecharge;
use App\Models\Station;
use App\Services\ActiviteStation;
use App\Services\Releves;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Tableau de bord de l'administrateur d'une station : ses recharges en direct,
 * son chiffre d'affaires, sa part nette après commission et ses relevés de reversement.
 */
class AdminMaStationController extends Controller
{
    public function __construct(private readonly Releves $releves, private readonly ActiviteStation $activite) {}

    public function index(Request $request): JsonResponse
    {
        $station = $this->station($request);
        $mois = $this->releves->mois($station, now()->format('Y-m'));
        $terminees = SessionRecharge::where('etat', 'terminee');
        $aujourdhui = (clone $terminees)->whereDate('date_debut', today());

        // Revenus des 30 derniers jours, jour par jour (périmètre de la station appliqué).
        $parJour = (clone $terminees)->where('date_debut', '>=', today()->subDays(29))
            ->selectRaw('DATE(date_debut) as jour, SUM(prix) as ca, SUM(energie_kwh) as kwh, COUNT(*) as n')
            ->groupBy('jour')->get()->keyBy('jour');

        $bornes = Borne::with('connecteurs')->orderBy('nom')->get();
        $prises = $bornes->flatMap->connecteurs;

        return response()->json([
            'station' => ['id' => $station->id, 'nom' => $station->nom, 'formule' => $station->formule, 'commissionPct' => (float) $station->commission_pct, 'statut' => $station->statut, 'finContrat' => $station->fin_contrat?->toDateString()],
            'aujourdhui' => [
                'chiffreAffaires' => round((float) (clone $aujourdhui)->sum('prix'), 3),
                'sessions' => (clone $aujourdhui)->count(),
                'energieKwh' => round((float) (clone $aujourdhui)->sum('energie_kwh'), 1),
            ],
            'mois' => $mois,
            'enDirect' => [
                'sessionsEnCours' => SessionRecharge::whereIn('etat', SessionRecharge::ETATS_ACTIFS)->count(),
                'puissanceKw' => round((float) SessionRecharge::where('etat', 'en_cours')->sum('puissance_instantanee_kw'), 1),
                // Taux d'occupation : prises en charge / prises en service.
                'occupationPct' => $prises->count() ? round($prises->where('etat', 'occupe')->count() / max(1, $prises->whereNotIn('etat', ['hors_service', 'defaut'])->count()) * 100) : 0,
            ],
            'bornes' => $this->activite->bornes($station),
            'recharges' => $this->activite->enCours($station),
            'clients' => $this->activite->clients($station),
            'messagesNonLus' => MessageStation::where('station_id', $station->id)->where('de_plateforme', true)->whereNull('lu_at')->count(),
            'serie' => collect(range(29, 0))->map(function ($d) use ($parJour) {
                $jour = today()->subDays($d)->toDateString();
                $l = $parJour->get($jour);

                return ['jour' => $jour, 'chiffreAffaires' => round((float) ($l->ca ?? 0), 3), 'energieKwh' => round((float) ($l->kwh ?? 0), 1), 'sessions' => (int) ($l->n ?? 0)];
            }),
            'releves' => $this->releves->annee($station, (int) $request->query('annee', now()->year)),
        ]);
    }

    private function station(Request $request): Station
    {
        $station = $request->user()->station;
        abort_unless($station, 404, 'Votre compte n’est rattaché à aucune station.');

        return $station;
    }
}
