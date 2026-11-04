<?php

namespace App\Services;

use App\Models\Batterie;
use App\Models\SessionRecharge;
use RuntimeException;

/**
 * Inscrit une recharge terminée dans le registre ChargeLedger, signée par le portefeuille de la
 * station agréée, puis rattachée au NFT de la batterie du véhicule. Le smart contract refuse
 * les doublons et les énergies impossibles : la recharge est alors marquée « refusee ».
 */
class CertificationRecharges
{
    public function __construct(private Blockchain $blockchain) {}

    public function certifier(SessionRecharge $session): void
    {
        $session->loadMissing(['borne.station', 'connecteur']);
        if (! $this->blockchain->actif() || $session->etat !== 'terminee' || $session->blockchain_statut === 'certifiee') {
            return;
        }
        $batterie = $session->vehicule_id
            ? Batterie::where('vehicule_id', $session->vehicule_id)->where('statut', 'activee')->first()
            : null;
        $energieWh = (int) round((float) $session->energie_kwh * 1000);
        // Seules les recharges faites après l'activation appartiennent à ce propriétaire.
        if (! $batterie || $energieWh <= 0 || ! $session->date_fin || ($batterie->activee_le && $session->date_fin->lt($batterie->activee_le))) {
            return; // véhicule sans batterie certifiée, recharge antérieure, ou rien à certifier
        }

        $station = $session->borne->station;
        $refStation = $station ? 'station:'.$station->id : 'station:plateforme';

        try {
            $this->blockchain->portefeuille($refStation, 'station', $station?->nom ?? 'Volteo');
            $resultat = $this->blockchain->enregistrerRecharge($refStation, [
                'numSerie' => $batterie->num_serie,
                'sessionId' => 'volteo-'.$session->id,
                'idBorne' => $session->borne->reference,
                'energieWh' => $energieWh,
                'puissanceMaxW' => (int) round((float) ($session->connecteur?->puissance_kw ?? $session->borne->puissance_kw) * 1000),
                'debut' => $session->date_debut->getTimestamp(),
                'fin' => $session->date_fin->getTimestamp(),
            ]);
            $session->forceFill(['blockchain_statut' => 'certifiee', 'blockchain_tx' => $resultat['tx'], 'blockchain_erreur' => null])->save();
        } catch (RuntimeException $e) {
            // 422 = refus du smart contract (anti-fraude) ; sinon pont ou réseau indisponible : à réessayer.
            $session->forceFill([
                'blockchain_statut' => $e->getCode() === 422 ? 'refusee' : 'echec',
                'blockchain_erreur' => mb_substr($e->getMessage(), 0, 250),
            ])->save();
        }
    }
}
