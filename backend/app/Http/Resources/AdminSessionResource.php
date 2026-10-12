<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminSessionResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'borneId' => $this->borne_id,
            'borneNom' => $this->borne?->nom,
            'userId' => $this->user_id,
            'userNom' => Concerns::nomComplet($this->user),
            'connecteurId' => $this->connecteur_id,
            'typeConnecteur' => $this->connecteur?->type,
            'vehiculeId' => $this->vehicule_id,
            'vehicule' => $this->vehicule ? trim("{$this->vehicule->marque} {$this->vehicule->modele} — {$this->vehicule->immatriculation}") : null,
            'origine' => $this->origine,
            'badgeUid' => $this->badge?->uid,
            'tarifNom' => $this->tarif?->nom,
            'dateDebut' => $this->date_debut->toIso8601String(),
            'dateFin' => $this->date_fin?->toIso8601String(),
            'dureeMinutes' => (int) round($this->dureeEffectiveSecondes() / 60),
            'energieKwh' => $this->energie_kwh,
            'prix' => $this->prix,
            'etat' => $this->etat,
            'puissanceInstantaneeKw' => $this->puissance_instantanee_kw,
            'pourcentageBatterie' => $this->pourcentage_batterie,
            'tempsRestantMinutes' => $this->tempsRestantMinutes(),
            'motifAnnulation' => $this->motif_annulation,
            'paiementStatut' => $this->whenLoaded('paiement', fn () => $this->paiement?->statut),
            'factureId' => $this->whenLoaded('facture', fn () => $this->facture?->id),
        ];
    }
}
