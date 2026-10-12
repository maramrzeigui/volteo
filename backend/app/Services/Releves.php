<?php

namespace App\Services;

use App\Models\Reversement;
use App\Models\SessionRecharge;
use App\Models\Station;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Relevés financiers d'une station : chiffre d'affaires des recharges terminées,
 * commission de la plateforme et montant net à reverser, mois par mois.
 */
class Releves
{
    /** @return array{periode: string, chiffreAffaires: float, commission: float, net: float, sessions: int, energieKwh: float} */
    public function mois(Station $station, string $periode): array
    {
        $debut = CarbonImmutable::createFromFormat('Y-m-d', $periode.'-01')->startOfMonth();
        $sessions = SessionRecharge::withoutGlobalScope('perimetre')
            ->where('etat', 'terminee')
            ->whereIn('borne_id', fn ($s) => $s->select('id')->from('bornes')->where('station_id', $station->id))
            ->whereBetween('date_debut', [$debut, $debut->endOfMonth()]);

        $ca = round((float) (clone $sessions)->sum('prix'), 3);
        $commission = round($ca * (float) $station->commission_pct / 100, 3);

        return [
            'periode' => $periode,
            'chiffreAffaires' => $ca,
            'commission' => $commission,
            'net' => round($ca - $commission, 3),
            'sessions' => (clone $sessions)->count(),
            'energieKwh' => round((float) (clone $sessions)->sum('energie_kwh'), 1),
        ];
    }

    /** Les 12 mois d'une année, avec l'état du reversement (payé, à payer, en cours). */
    public function annee(Station $station, int $annee): array
    {
        $payes = Reversement::where('station_id', $station->id)->where('periode', 'like', "{$annee}-%")->get()->keyBy('periode');
        $courant = now()->format('Y-m');

        return collect(range(1, 12))
            ->map(fn ($m) => sprintf('%d-%02d', $annee, $m))
            ->filter(fn ($p) => $p <= $courant)
            ->map(function ($p) use ($station, $payes, $courant) {
                $paye = $payes->get($p);
                $ligne = $paye ? [
                    'periode' => $p,
                    'chiffreAffaires' => (float) $paye->chiffre_affaires,
                    'commission' => (float) $paye->commission,
                    'net' => (float) $paye->net,
                    'sessions' => $paye->sessions,
                    'energieKwh' => (float) $paye->energie_kwh,
                ] : $this->mois($station, $p);

                return [
                    ...$ligne,
                    'statut' => $paye ? 'paye' : ($p === $courant ? 'en_cours' : ($ligne['chiffreAffaires'] > 0 ? 'a_payer' : 'neant')),
                    'payeLe' => $paye?->paye_le?->toIso8601String(),
                    'reference' => $paye?->reference,
                ];
            })
            ->values()
            ->all();
    }

    /** Enregistre le paiement d'un mois clos : les montants sont figés au moment du virement. */
    public function payer(Station $station, string $periode, User $auteur, ?string $reference): Reversement
    {
        abort_if($periode >= now()->format('Y-m'), 422, 'Seul un mois terminé peut être reversé.');
        abort_if(Reversement::where('station_id', $station->id)->where('periode', $periode)->exists(), 422, 'Ce mois a déjà été reversé.');

        $m = $this->mois($station, $periode);

        return Reversement::create([
            'station_id' => $station->id,
            'periode' => $periode,
            'chiffre_affaires' => $m['chiffreAffaires'],
            'commission' => $m['commission'],
            'net' => $m['net'],
            'sessions' => $m['sessions'],
            'energie_kwh' => $m['energieKwh'],
            'statut' => 'paye',
            'reference' => $reference,
            'paye_le' => now(),
            'paye_par' => $auteur->id,
        ]);
    }
}
