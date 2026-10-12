<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Alerte;
use App\Models\AuditLog;
use App\Models\Borne;
use App\Models\Maintenance;
use App\Models\Parametre;
use App\Models\SessionRecharge;
use App\Support\Exporteur;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Symfony\Component\HttpFoundation\Response;

/**
 * Module 14 — rapports : consommation, CA, utilisation, disponibilité,
 * top bornes, top clients, maintenance. Exports PDF, Excel et CSV.
 */
class AdminRapportController extends Controller
{
    public const TYPES = [
        'consommation' => 'Consommation énergétique',
        'chiffre_affaires' => "Chiffre d'affaires",
        'utilisation' => 'Utilisation des bornes',
        'disponibilite' => 'Disponibilité des bornes',
        'top_bornes' => 'Top bornes',
        'top_clients' => 'Top clients',
        'maintenance' => 'Maintenance',
    ];

    public function show(Request $request, string $type): JsonResponse
    {
        return response()->json($this->construire($request, $type));
    }

    public function export(Request $request, string $type): Response
    {
        $format = $request->validate(['format' => ['required', 'in:'.implode(',', Exporteur::FORMATS)]])['format'];
        $rapport = $this->construire($request, $type);

        AuditLog::record($request->user()->id, 'export', 'rapport:'.$type, strtoupper($format)." {$rapport['periode']['debut']} → {$rapport['periode']['fin']}");

        return Exporteur::reponse(
            $rapport['titre'],
            $rapport['colonnes'],
            $rapport['lignes'],
            $format,
            'Période du '.Carbon::parse($rapport['periode']['debut'])->format('d/m/Y').' au '.Carbon::parse($rapport['periode']['fin'])->format('d/m/Y')
        );
    }

    /** @return array{type: string, titre: string, periode: array, colonnes: array, lignes: Collection, totaux: array} */
    private function construire(Request $request, string $type): array
    {
        abort_unless(isset(self::TYPES[$type]), 404, 'Rapport inconnu.');

        $data = $request->validate([
            'debut' => ['nullable', 'date'],
            'fin' => ['nullable', 'date', 'after_or_equal:debut'],
            'borne_id' => ['nullable', 'exists:bornes,id'],
        ]);
        $debut = Carbon::parse($data['debut'] ?? now()->subDays(29))->startOfDay();
        $fin = Carbon::parse($data['fin'] ?? now())->endOfDay();
        $borneId = $data['borne_id'] ?? null;

        [$colonnes, $lignes, $totaux] = $this->{str($type)->camel()->toString()}($debut, $fin, $borneId);

        return [
            'type' => $type,
            'titre' => self::TYPES[$type],
            'periode' => ['debut' => $debut->toDateString(), 'fin' => $fin->toDateString()],
            'devise' => Parametre::get('devise'),
            'colonnes' => $colonnes,
            'lignes' => $lignes->values(),
            'totaux' => $totaux,
        ];
    }

    private function sessions(Carbon $debut, Carbon $fin, ?int $borneId)
    {
        // Colonnes qualifiées : certains rapports joignent bornes / users (colonne « etat » commune).
        return SessionRecharge::query()
            ->whereBetween('sessions_recharge.date_debut', [$debut, $fin])
            ->when($borneId, fn ($q) => $q->where('sessions_recharge.borne_id', $borneId));
    }

    /** Consommation journalière (kWh) et nombre de sessions. */
    private function consommation(Carbon $debut, Carbon $fin, ?int $borneId): array
    {
        $parJour = $this->sessions($debut, $fin, $borneId)->where('sessions_recharge.etat', 'terminee')
            ->selectRaw('DATE(date_debut) as jour, COUNT(*) as sessions, SUM(energie_kwh) as kwh, AVG(energie_kwh) as moyenne')
            ->groupBy('jour')->get()->keyBy('jour');

        $lignes = collect();
        for ($j = $debut->copy(); $j->lte($fin); $j->addDay()) {
            $l = $parJour->get($j->toDateString());
            $lignes->push([
                'jour' => $j->format('d/m/Y'),
                'sessions' => (int) ($l->sessions ?? 0),
                'kwh' => round((float) ($l->kwh ?? 0), 2),
                'moyenneKwh' => round((float) ($l->moyenne ?? 0), 2),
            ]);
        }

        return [
            ['jour' => 'Jour', 'sessions' => 'Sessions', 'kwh' => 'Énergie (kWh)', 'moyenneKwh' => 'Moyenne / session (kWh)'],
            $lignes,
            ['sessions' => $lignes->sum('sessions'), 'kwh' => round($lignes->sum('kwh'), 2)],
        ];
    }

    /** CA journalier, HT / TVA / TTC. */
    private function chiffreAffaires(Carbon $debut, Carbon $fin, ?int $borneId): array
    {
        $taux = (float) Parametre::get('tva_taux', 19);
        $parJour = $this->sessions($debut, $fin, $borneId)->where('sessions_recharge.etat', 'terminee')
            ->selectRaw('DATE(date_debut) as jour, COUNT(*) as sessions, SUM(prix) as ttc')
            ->groupBy('jour')->get()->keyBy('jour');

        $lignes = collect();
        for ($j = $debut->copy(); $j->lte($fin); $j->addDay()) {
            $ttc = round((float) ($parJour->get($j->toDateString())->ttc ?? 0), 2);
            $ht = round($ttc / (1 + $taux / 100), 2);
            $lignes->push([
                'jour' => $j->format('d/m/Y'),
                'sessions' => (int) ($parJour->get($j->toDateString())->sessions ?? 0),
                'ht' => $ht,
                'tva' => round($ttc - $ht, 2),
                'ttc' => $ttc,
            ]);
        }

        return [
            ['jour' => 'Jour', 'sessions' => 'Sessions', 'ht' => 'CA HT', 'tva' => 'TVA', 'ttc' => 'CA TTC'],
            $lignes,
            ['sessions' => $lignes->sum('sessions'), 'ht' => round($lignes->sum('ht'), 2), 'tva' => round($lignes->sum('tva'), 2), 'ttc' => round($lignes->sum('ttc'), 2)],
        ];
    }

    /** Taux d'occupation : temps de charge / temps disponible des connecteurs. */
    private function utilisation(Carbon $debut, Carbon $fin, ?int $borneId): array
    {
        $minutesPeriode = max(1, $debut->diffInMinutes($fin));
        $stats = $this->sessions($debut, $fin, $borneId)->where('sessions_recharge.etat', 'terminee')
            ->selectRaw('borne_id, COUNT(*) as sessions, SUM(TIMESTAMPDIFF(MINUTE, date_debut, date_fin)) as minutes, SUM(energie_kwh) as kwh')
            ->groupBy('borne_id')->get()->keyBy('borne_id');

        $lignes = $this->bornes($borneId)->map(function (Borne $b) use ($stats, $minutesPeriode) {
            $s = $stats->get($b->id);
            $capacite = max(1, $b->connecteurs_count) * $minutesPeriode;

            return [
                'borne' => $b->nom,
                'connecteurs' => $b->connecteurs_count,
                'sessions' => (int) ($s->sessions ?? 0),
                'heures' => round(((float) ($s->minutes ?? 0)) / 60, 1),
                'kwh' => round((float) ($s->kwh ?? 0), 2),
                'tauxOccupation' => round(((float) ($s->minutes ?? 0)) / $capacite * 100, 1),
            ];
        })->sortByDesc('tauxOccupation');

        return [
            ['borne' => 'Borne', 'connecteurs' => 'Connecteurs', 'sessions' => 'Sessions', 'heures' => 'Heures de charge', 'kwh' => 'Énergie (kWh)', 'tauxOccupation' => "Taux d'occupation (%)"],
            $lignes,
            ['sessions' => $lignes->sum('sessions'), 'heures' => round($lignes->sum('heures'), 1), 'tauxMoyen' => round($lignes->avg('tauxOccupation') ?? 0, 1)],
        ];
    }

    /**
     * Disponibilité : part du temps hors indisponibilité. L'indisponibilité est
     * estimée à partir des alertes de déconnexion / défaut et des maintenances.
     */
    private function disponibilite(Carbon $debut, Carbon $fin, ?int $borneId): array
    {
        $minutesPeriode = max(1, $debut->diffInMinutes($fin));

        $lignes = $this->bornes($borneId)->map(function (Borne $b) use ($debut, $fin, $minutesPeriode) {
            $indispo = 0;
            $incidents = 0;

            Alerte::where('borne_id', $b->id)
                ->whereIn('type', ['borne_deconnectee', 'defaut_materiel', 'coupure_electrique'])
                ->where('created_at', '<=', $fin)
                ->where(fn ($q) => $q->whereNull('resolue_le')->orWhere('resolue_le', '>=', $debut))
                ->get()
                ->each(function (Alerte $a) use (&$indispo, &$incidents, $debut, $fin) {
                    $incidents++;
                    $indispo += $this->chevauchement($a->created_at, $a->resolue_le ?? now(), $debut, $fin);
                });

            Maintenance::where('borne_id', $b->id)
                ->whereNotNull('date_debut')
                ->where('date_debut', '<=', $fin)
                ->where(fn ($q) => $q->whereNull('date_fin')->orWhere('date_fin', '>=', $debut))
                ->get()
                ->each(function (Maintenance $m) use (&$indispo, $debut, $fin) {
                    $indispo += $this->chevauchement($m->date_debut, $m->date_fin ?? now(), $debut, $fin);
                });

            $indispo = min($indispo, $minutesPeriode);

            return [
                'borne' => $b->nom,
                'etat' => $b->etat,
                'incidents' => $incidents,
                'heuresIndisponibles' => round($indispo / 60, 1),
                'disponibilite' => round(100 - $indispo / $minutesPeriode * 100, 2),
            ];
        })->sortBy('disponibilite');

        return [
            ['borne' => 'Borne', 'etat' => 'État actuel', 'incidents' => 'Incidents', 'heuresIndisponibles' => 'Heures indisponibles', 'disponibilite' => 'Disponibilité (%)'],
            $lignes,
            ['incidents' => $lignes->sum('incidents'), 'disponibiliteMoyenne' => round($lignes->avg('disponibilite') ?? 100, 2)],
        ];
    }

    private function topBornes(Carbon $debut, Carbon $fin, ?int $borneId): array
    {
        $lignes = $this->sessions($debut, $fin, $borneId)->where('sessions_recharge.etat', 'terminee')
            ->join('bornes', 'bornes.id', '=', 'sessions_recharge.borne_id')
            ->selectRaw('bornes.nom as borne, bornes.adresse as adresse, COUNT(*) as sessions, SUM(energie_kwh) as kwh, SUM(prix) as ca')
            ->groupBy('bornes.id', 'bornes.nom', 'bornes.adresse')
            ->orderByDesc('kwh')
            ->limit(20)
            ->get()
            ->values()
            ->map(fn ($l, $i) => [
                'rang' => $i + 1,
                'borne' => $l->borne,
                'adresse' => $l->adresse,
                'sessions' => (int) $l->sessions,
                'kwh' => round((float) $l->kwh, 2),
                'ca' => round((float) $l->ca, 2),
            ]);

        return [
            ['rang' => '#', 'borne' => 'Borne', 'adresse' => 'Adresse', 'sessions' => 'Sessions', 'kwh' => 'Énergie (kWh)', 'ca' => 'CA TTC'],
            $lignes,
            ['sessions' => $lignes->sum('sessions'), 'kwh' => round($lignes->sum('kwh'), 2), 'ca' => round($lignes->sum('ca'), 2)],
        ];
    }

    private function topClients(Carbon $debut, Carbon $fin, ?int $borneId): array
    {
        $lignes = $this->sessions($debut, $fin, $borneId)->where('sessions_recharge.etat', 'terminee')
            ->join('users', 'users.id', '=', 'sessions_recharge.user_id')
            ->selectRaw("CONCAT(COALESCE(users.prenom, ''), ' ', COALESCE(users.nom, '')) as client, users.email as email, COUNT(*) as sessions, SUM(energie_kwh) as kwh, SUM(prix) as depenses")
            ->groupBy('users.id', 'users.prenom', 'users.nom', 'users.email')
            ->orderByDesc('depenses')
            ->limit(20)
            ->get()
            ->values()
            ->map(fn ($l, $i) => [
                'rang' => $i + 1,
                'client' => trim($l->client),
                'email' => $l->email,
                'sessions' => (int) $l->sessions,
                'kwh' => round((float) $l->kwh, 2),
                'depenses' => round((float) $l->depenses, 2),
            ]);

        return [
            ['rang' => '#', 'client' => 'Client', 'email' => 'Email', 'sessions' => 'Sessions', 'kwh' => 'Énergie (kWh)', 'depenses' => 'Dépenses TTC'],
            $lignes,
            ['sessions' => $lignes->sum('sessions'), 'kwh' => round($lignes->sum('kwh'), 2), 'depenses' => round($lignes->sum('depenses'), 2)],
        ];
    }

    private function maintenance(Carbon $debut, Carbon $fin, ?int $borneId): array
    {
        $lignes = Maintenance::with(['borne', 'technicien', 'pieces'])
            ->where(fn ($q) => $q->whereBetween('date_prevue', [$debut->toDateString(), $fin->toDateString()])
                ->orWhereBetween('created_at', [$debut, $fin]))
            ->when($borneId, fn ($q) => $q->where('borne_id', $borneId))
            ->orderBy('date_prevue')
            ->get()
            ->map(fn (Maintenance $m) => [
                'reference' => $m->reference,
                'borne' => $m->borne?->nom,
                'type' => $m->type,
                'priorite' => $m->priorite,
                'statut' => $m->statut,
                'technicien' => trim(($m->technicien?->prenom ?? '').' '.($m->technicien?->nom ?? '')) ?: '—',
                'datePrevue' => $m->date_prevue?->format('d/m/Y') ?? '—',
                'dureeHeures' => $m->date_debut && $m->date_fin ? round($m->date_debut->diffInMinutes($m->date_fin) / 60, 1) : 0,
                'coutPieces' => round($m->pieces->sum(fn ($p) => $p->quantite * $p->cout_unitaire), 2),
            ]);

        return [
            ['reference' => 'OT', 'borne' => 'Borne', 'type' => 'Type', 'priorite' => 'Priorité', 'statut' => 'Statut', 'technicien' => 'Technicien', 'datePrevue' => 'Date prévue', 'dureeHeures' => 'Durée (h)', 'coutPieces' => 'Coût pièces'],
            $lignes,
            [
                'ordres' => $lignes->count(),
                'terminees' => $lignes->where('statut', 'terminee')->count(),
                'correctives' => $lignes->where('type', 'corrective')->count(),
                'coutPieces' => round($lignes->sum('coutPieces'), 2),
            ],
        ];
    }

    private function bornes(?int $borneId): Collection
    {
        return Borne::where('source', 'reseau')
            ->when($borneId, fn ($q) => $q->whereKey($borneId))
            ->withCount('connecteurs')
            ->orderBy('nom')
            ->get();
    }

    private function chevauchement(Carbon $a, Carbon $b, Carbon $debut, Carbon $fin): int
    {
        $start = $a->greaterThan($debut) ? $a : $debut;
        $end = $b->lessThan($fin) ? $b : $fin;

        return $end->greaterThan($start) ? (int) $start->diffInMinutes($end) : 0;
    }
}
