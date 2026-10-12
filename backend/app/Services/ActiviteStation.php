<?php

namespace App\Services;

use App\Models\Borne;
use App\Models\SessionRecharge;
use App\Models\Station;
use Illuminate\Database\Eloquent\Builder;

/**
 * Activité d'une station, vue par son administrateur ou par le super-admin :
 * recharges en cours (client, borne, puissance), puissance par borne et clients du mois.
 */
class ActiviteStation
{
    private function sessions(Station $station): Builder
    {
        return SessionRecharge::query()->whereHas('borne', fn (Builder $q) => $q->where('station_id', $station->id));
    }

    /** @return array<int, array<string, mixed>> */
    public function enCours(Station $station): array
    {
        return $this->sessions($station)->whereIn('etat', SessionRecharge::ETATS_ACTIFS)
            ->with(['user:id,prenom,nom', 'borne:id,nom,puissance_kw', 'connecteur:id,type'])
            ->orderByDesc('date_debut')->get()
            ->map(fn (SessionRecharge $s) => [
                'id' => $s->id,
                'client' => $s->user ? trim("{$s->user->prenom} {$s->user->nom}") : 'Badge RFID',
                'borne' => $s->borne?->nom,
                'borneId' => $s->borne_id,
                'connecteur' => $s->connecteur?->type,
                'etat' => $s->etat,
                'debut' => $s->date_debut?->toIso8601String(),
                'puissanceKw' => round((float) $s->puissance_instantanee_kw, 1),
                'puissanceMaxKw' => $s->borne?->puissance_kw,
                'energieKwh' => round((float) $s->energie_kwh, 2),
                'batterie' => $s->pourcentage_batterie,
                'prix' => round((float) $s->prix, 3),
            ])->all();
    }

    /** Puissance délivrée en ce moment et recharges du jour, borne par borne. */
    public function bornes(Station $station): array
    {
        $direct = $this->sessions($station)->where('etat', 'en_cours')
            ->selectRaw('borne_id, SUM(puissance_instantanee_kw) as kw, COUNT(*) as n')->groupBy('borne_id')->get()->keyBy('borne_id');
        $jour = $this->sessions($station)->whereDate('date_debut', today())
            ->selectRaw('borne_id, COUNT(*) as n, SUM(energie_kwh) as kwh')->groupBy('borne_id')->get()->keyBy('borne_id');

        return Borne::withoutGlobalScopes()->where('station_id', $station->id)->orderBy('nom')->get()
            ->map(fn (Borne $b) => [
                'id' => $b->id,
                'nom' => $b->nom,
                'etat' => $b->etat,
                'enLigne' => $b->estEnLigne(),
                'puissanceKw' => $b->puissance_kw,
                'puissanceActuelleKw' => round((float) ($direct->get($b->id)->kw ?? 0), 1),
                'sessionsEnCours' => (int) ($direct->get($b->id)->n ?? 0),
                'sessionsJour' => (int) ($jour->get($b->id)->n ?? 0),
                'energieJourKwh' => round((float) ($jour->get($b->id)->kwh ?? 0), 1),
            ])->values()->all();
    }

    /** Clients ayant rechargé ce mois-ci sur les bornes de la station. */
    public function clients(Station $station, int $limite = 20): array
    {
        return $this->sessions($station)->where('etat', 'terminee')->whereNotNull('user_id')
            ->where('date_debut', '>=', now()->startOfMonth())
            ->selectRaw('user_id, COUNT(*) as n, SUM(energie_kwh) as kwh, SUM(prix) as montant, MAX(date_debut) as derniere')
            ->groupBy('user_id')->orderByDesc('montant')->limit($limite)
            ->with('user:id,prenom,nom,email')->get()
            ->map(fn ($l) => [
                'id' => $l->user_id,
                'nom' => $l->user ? trim("{$l->user->prenom} {$l->user->nom}") : '—',
                'email' => $l->user?->email,
                'recharges' => (int) $l->n,
                'energieKwh' => round((float) $l->kwh, 1),
                'montant' => round((float) $l->montant, 3),
                'derniere' => $l->derniere,
            ])->values()->all();
    }
}
