<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Concerns;
use App\Models\Alerte;
use App\Models\Borne;
use App\Models\Maintenance;
use App\Models\SessionRecharge;
use App\Services\OcppClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminStatsController extends Controller
{
    /** KPIs réseau (module 15 — tableau de bord). */
    public function index(): JsonResponse
    {
        $reseau = Borne::where('source', 'reseau');
        $terminees = SessionRecharge::where('etat', 'terminee');
        $total = (clone $reseau)->count();
        $actives = (clone $reseau)->whereIn('etat', ['disponible', 'occupee'])->count();

        return response()->json([
            'bornesTotal' => $total,
            'bornesActives' => $actives,
            'bornesIndisponibles' => (clone $reseau)->whereIn('etat', Borne::ETATS_INDISPONIBLES)->count(),
            'bornesOccupees' => (clone $reseau)->where('etat', 'occupee')->count(),
            'tauxDisponibilite' => $total ? round($actives / $total * 100, 1) : 0,
            'sessionsAujourdhui' => SessionRecharge::whereDate('date_debut', today())->count(),
            'sessionsEnCours' => SessionRecharge::whereIn('etat', SessionRecharge::ETATS_ACTIFS)->count(),
            'puissanceInstantaneeKw' => round((float) SessionRecharge::where('etat', 'en_cours')->sum('puissance_instantanee_kw'), 1),
            'caTotal' => (float) (clone $terminees)->sum('prix'),
            'caAujourdhui' => (float) (clone $terminees)->whereDate('date_debut', today())->sum('prix'),
            'caMois' => (float) (clone $terminees)->where('date_debut', '>=', now()->startOfMonth())->sum('prix'),
            'kwhTotal' => (float) (clone $terminees)->sum('energie_kwh'),
            'kwhAujourdhui' => (float) (clone $terminees)->whereDate('date_debut', today())->sum('energie_kwh'),
            'tempsMoyenMinutes' => (int) round(
                ((clone $terminees)->selectRaw('AVG(TIMESTAMPDIFF(MINUTE, date_debut, date_fin)) as m')->value('m')) ?? 0
            ),
            'alertesOuvertes' => Alerte::where('resolue', false)->count(),
            'alertesCritiques' => Alerte::where('resolue', false)->where('gravite', 'critique')->count(),
            'maintenancesEnCours' => Maintenance::whereIn('statut', ['planifiee', 'en_cours'])->count(),
        ]);
    }

    /** Séries journalières (sessions, kWh, CA) pour les graphiques. */
    public function series(Request $request): JsonResponse
    {
        $jours = min(90, max(7, (int) $request->query('jours', 14)));
        $debut = today()->subDays($jours - 1);

        $lignes = SessionRecharge::where('date_debut', '>=', $debut)
            ->selectRaw('DATE(date_debut) as jour, COUNT(*) as sessions, SUM(energie_kwh) as kwh, SUM(CASE WHEN etat = "terminee" THEN prix ELSE 0 END) as ca')
            ->groupBy('jour')
            ->get()
            ->keyBy('jour');

        $serie = collect(range(0, $jours - 1))->map(function (int $i) use ($debut, $lignes) {
            $jour = $debut->copy()->addDays($i)->format('Y-m-d');
            $l = $lignes->get($jour);

            return [
                'jour' => $jour,
                'sessions' => (int) ($l->sessions ?? 0),
                'kwh' => round((float) ($l->kwh ?? 0), 2),
                'ca' => round((float) ($l->ca ?? 0), 2),
            ];
        });

        // Occupation par heure de la journée (profil d'usage).
        $parHeure = SessionRecharge::where('date_debut', '>=', $debut)
            ->selectRaw('HOUR(date_debut) as heure, COUNT(*) as n')
            ->groupBy('heure')
            ->pluck('n', 'heure');

        // Requête Eloquent : le périmètre de la station s'applique aussi à cette statistique.
        $connecteurs = SessionRecharge::query()
            ->join('connecteurs', 'connecteurs.id', '=', 'sessions_recharge.connecteur_id')
            ->where('sessions_recharge.date_debut', '>=', $debut)
            ->selectRaw('connecteurs.type as type, COUNT(*) as n')
            ->groupBy('connecteurs.type')
            ->pluck('n', 'type');

        return response()->json([
            'jours' => $serie,
            'parHeure' => collect(range(0, 23))->map(fn ($h) => ['heure' => $h, 'sessions' => (int) ($parHeure[$h] ?? 0)]),
            'parConnecteur' => $connecteurs->map(fn ($n, $type) => ['type' => $type, 'sessions' => (int) $n])->values(),
        ]);
    }

    /**
     * Module 4 — supervision temps réel : état, occupation, température,
     * connexion, dernier heartbeat, sessions en cours et temps restant, alertes.
     */
    public function supervision(OcppClient $ocpp): JsonResponse
    {
        $connectees = $ocpp->bornesConnectees();

        $sessions = SessionRecharge::with(['user', 'vehicule', 'connecteur'])
            ->whereIn('etat', SessionRecharge::ETATS_ACTIFS)
            ->get()
            ->groupBy('borne_id');

        $bornes = Borne::where('source', 'reseau')
            ->with('connecteurs')
            ->withCount(['alertes as alertes_ouvertes' => fn ($q) => $q->where('resolue', false)])
            ->orderBy('nom')
            ->get()
            ->map(function (Borne $b) use ($sessions, $connectees) {
                $enCours = $sessions->get($b->id, collect());

                return [
                    'id' => $b->id,
                    'nom' => $b->nom,
                    'reference' => $b->reference,
                    'adresse' => $b->adresse,
                    'latitude' => $b->latitude,
                    'longitude' => $b->longitude,
                    'etat' => $b->etat,
                    'puissanceKw' => $b->puissance_kw,
                    'enLigne' => $b->estEnLigne(),
                    'websocket' => $connectees === null ? null : in_array($b->reference, $connectees, true),
                    'temperatureC' => $b->temperature_c,
                    'dernierHeartbeat' => $b->dernier_heartbeat?->toIso8601String(),
                    'connecteursTotal' => $b->connecteurs->count(),
                    'connecteursOccupes' => $b->connecteurs->where('etat', 'occupe')->count(),
                    'alertesOuvertes' => $b->alertes_ouvertes,
                    'connecteurs' => $b->connecteurs->map(fn ($c) => ['id' => $c->id, 'type' => $c->type, 'puissanceKw' => $c->puissance_kw, 'etat' => $c->etat]),
                    'sessions' => $enCours->map(fn (SessionRecharge $s) => [
                        'id' => $s->id,
                        'connecteurId' => $s->connecteur_id,
                        'typeConnecteur' => $s->connecteur?->type,
                        'userNom' => Concerns::nomComplet($s->user),
                        'etat' => $s->etat,
                        'dateDebut' => $s->date_debut->toIso8601String(),
                        'energieKwh' => $s->energie_kwh,
                        'puissanceKw' => $s->puissance_instantanee_kw,
                        'pourcentageBatterie' => $s->pourcentage_batterie,
                        'prix' => $s->prix,
                        'tempsRestantMinutes' => $s->tempsRestantMinutes(),
                    ])->values(),
                ];
            });

        return response()->json([
            'serveurOcpp' => $connectees !== null,
            'horodatage' => now()->toIso8601String(),
            'bornes' => $bornes,
        ]);
    }

    /** Classement des bornes les plus utilisées sur 30 jours. */
    public function topBornes(): JsonResponse
    {
        return response()->json(
            SessionRecharge::where('date_debut', '>=', now()->subDays(30))
                ->where('etat', 'terminee')
                ->selectRaw('borne_id, COUNT(*) as sessions, SUM(energie_kwh) as kwh, SUM(prix) as ca')
                ->groupBy('borne_id')
                ->orderByDesc('kwh')
                ->limit(5)
                ->with('borne:id,nom')
                ->get()
                ->map(fn ($l) => [
                    'borneId' => $l->borne_id,
                    'borneNom' => $l->borne?->nom,
                    'sessions' => (int) $l->sessions,
                    'kwh' => round((float) $l->kwh, 2),
                    'ca' => round((float) $l->ca, 2),
                ])
        );
    }
}
