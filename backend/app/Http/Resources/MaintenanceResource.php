<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Ordre de travail (module 11). Le détail inclut pièces, interventions, commentaires et photos. */
class MaintenanceResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'borneId' => $this->borne_id,
            'borneNom' => $this->borne?->nom,
            'panneId' => $this->panne_id,
            'technicienId' => $this->technicien_id,
            'technicienNom' => Concerns::nomComplet($this->technicien),
            'type' => $this->type,
            'priorite' => $this->priorite,
            'titre' => $this->titre,
            'statut' => $this->statut,
            'description' => $this->description,
            'datePrevue' => $this->date_prevue?->format('Y-m-d'),
            'dateDebut' => $this->date_debut?->toIso8601String(),
            'dateFin' => $this->date_fin?->toIso8601String(),
            'rapport' => $this->rapport,
            'periodiciteJours' => $this->periodicite_jours,
            'coutPieces' => $this->whenLoaded('pieces', fn () => round($this->pieces->sum(fn ($p) => $p->quantite * $p->cout_unitaire), 2)),
            'pieces' => $this->whenLoaded('pieces', fn () => $this->pieces->map(fn ($p) => [
                'id' => $p->id,
                'designation' => $p->designation,
                'reference' => $p->reference,
                'quantite' => $p->quantite,
                'coutUnitaire' => $p->cout_unitaire,
            ])),
            'interventions' => $this->whenLoaded('interventions', fn () => $this->interventions->map(fn ($i) => [
                'id' => $i->id,
                'technicienNom' => Concerns::nomComplet($i->technicien),
                'debut' => $i->debut->toIso8601String(),
                'fin' => $i->fin?->toIso8601String(),
                'description' => $i->description,
            ])),
            'commentaires' => $this->whenLoaded('commentaires', fn () => $this->commentaires->map(fn ($c) => [
                'id' => $c->id,
                'auteur' => Concerns::nomComplet($c->user) ?? 'Système',
                'contenu' => $c->contenu,
                'date' => $c->created_at->toIso8601String(),
            ])),
            'photos' => DocumentResource::collection($this->whenLoaded('photos')),
            'createdAt' => $this->created_at->toIso8601String(),
        ];
    }
}
