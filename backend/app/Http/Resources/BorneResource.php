<?php

namespace App\Http\Resources;

use App\Services\Tarification;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Sortie alignée sur le type `Borne` de l'app mobile (champs back-office ajoutés). */
class BorneResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'source' => $this->source,
            'stationId' => $this->station_id,
            'stationNom' => $this->when($request->user()?->estPersonnel() ?? false, fn () => $this->station?->nom),
            'operateur' => $this->operateur,
            'nom' => $this->nom,
            'reference' => $this->reference,
            'numeroSerie' => $this->numero_serie,
            'modele' => $this->modele,
            'fabricant' => $this->fabricant,
            'adresse' => $this->adresse,
            'photoUrl' => $this->photo ? '/storage/'.$this->photo : null,
            'photoCredit' => $this->photo ? $this->photo_credit : null,
            'site' => $this->site,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'versionFirmware' => $this->version_firmware,
            'versionOcpp' => $this->version_ocpp,
            'puissanceKw' => $this->puissance_kw,
            'etat' => $this->etat,
            'enLigne' => $this->estEnLigne(),
            'dernierHeartbeat' => $this->dernier_heartbeat?->toIso8601String(),
            'deconnecteeLe' => $this->deconnectee_le?->toIso8601String(),
            // Le personnel voit si la borne est protégée par un mot de passe OCPP (jamais le mot de passe).
            'ocppSecurise' => $this->when($request->user()?->estPersonnel() ?? false, fn () => $this->ocpp_mot_de_passe !== null),
            'temperatureC' => $this->temperature_c,
            'tarifKwh' => $this->tarif_kwh,
            'tarifId' => $this->tarif_id,
            'tarifSpecialId' => $this->tarif_special_id,
            'tarifLibelle' => $this->when($this->relationLoaded('tarif'), fn () => app(Tarification::class)->libelle($this->resource)),
            // Tarif en vigueur détaillé (mode, heures creuses, frais) pour l'estimation côté client.
            'tarifApplique' => $this->when($this->relationLoaded('tarif'), function () {
                $tarif = app(Tarification::class)->tarifApplicable($this->resource);

                return $tarif ? [
                    'nom' => $tarif->nom,
                    'mode' => $tarif->mode,
                    'prix' => $tarif->prix,
                    'prixHeuresCreuses' => $tarif->prix_heures_creuses,
                    'heuresCreusesDebut' => $tarif->heures_creuses_debut ? substr($tarif->heures_creuses_debut, 0, 5) : null,
                    'heuresCreusesFin' => $tarif->heures_creuses_fin ? substr($tarif->heures_creuses_fin, 0, 5) : null,
                    'fraisSession' => $tarif->frais_session,
                    'special' => $tarif->special,
                    'valideAu' => $tarif->valide_au?->format('Y-m-d'),
                ] : null;
            }),
            'exploitantId' => $this->exploitant_id,
            'exploitantNom' => $this->when($this->relationLoaded('exploitant'), fn () => Concerns::nomComplet($this->exploitant)),
            'technicienId' => $this->technicien_id,
            'technicienNom' => $this->when($this->relationLoaded('technicien'), fn () => Concerns::nomComplet($this->technicien)),
            // Contacts des responsables de la borne (personnel uniquement).
            'responsables' => $this->when(
                ($request->user()?->estPersonnel() ?? false) && $this->relationLoaded('exploitant') && $this->relationLoaded('technicien'),
                fn () => [
                    'admin' => $this->exploitant ? ['id' => $this->exploitant->id, 'nom' => Concerns::nomComplet($this->exploitant), 'email' => $this->exploitant->email, 'telephone' => $this->exploitant->telephone, 'actif' => (bool) $this->exploitant->actif] : null,
                    'technicien' => $this->technicien ? ['id' => $this->technicien->id, 'nom' => Concerns::nomComplet($this->technicien), 'email' => $this->technicien->email, 'telephone' => $this->technicien->telephone] : null,
                ],
            ),
            'alertesOuvertes' => $this->whenCounted('alertes_ouvertes'),
            'connecteurs' => ConnecteurResource::collection($this->whenLoaded('connecteurs')),
        ];
    }
}
