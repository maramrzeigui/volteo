<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Sortie alignée sur le type `SessionRecharge` de l'app mobile. */
class SessionRechargeResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        $duree = $this->date_fin
            ? (int) round($this->date_debut->diffInSeconds($this->date_fin) / 60)
            : null;

        return [
            'id' => $this->id,
            'borneId' => $this->borne_id,
            'borneNom' => $this->borne->nom,
            'connecteurId' => $this->connecteur_id,
            'typeConnecteur' => $this->connecteur->type,
            'puissanceMaxKw' => $this->connecteur->puissance_kw,
            'vehiculeId' => $this->vehicule_id,
            'dateDebut' => $this->date_debut->toIso8601String(),
            'dateFin' => $this->date_fin?->toIso8601String(),
            'dureeMinutes' => $duree,
            'energieKwh' => $this->energie_kwh,
            'prix' => $this->prix,
            'etat' => $this->etat,
            // Recharge arrêtée automatiquement : le solde du wallet a été atteint.
            'arretSolde' => (bool) $this->arret_solde,
            // Budget de la recharge = solde du wallet (la recharge s'arrête quand le prix l'atteint).
            'budget' => $this->estActive() ? round((float) $this->user?->solde_wallet, 2) : null,
            'puissanceInstantaneeKw' => $this->puissance_instantanee_kw,
            'pourcentageBatterie' => $this->pourcentage_batterie,
            // paye, en_attente (solde insuffisant : paiement différé), rembourse…
            'paiementStatut' => $this->whenLoaded('paiement', fn () => $this->paiement?->statut),
        ];
    }
}
