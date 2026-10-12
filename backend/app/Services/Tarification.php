<?php

namespace App\Services;

use App\Models\Borne;
use App\Models\Parametre;
use App\Models\SessionRecharge;
use App\Models\Tarif;
use App\Models\User;
use Carbon\CarbonInterface;

/**
 * Module 10 — calcul du prix d'une recharge.
 *
 * Tarif applicable : tarif spécial de la borne s'il est valide, sinon son tarif
 * standard, sinon le prix au kWh historique de la borne (`tarif_kwh`).
 * Modes : par kWh, par minute, par heure ou par puissance (kW × h), avec prix
 * heures creuses selon l'heure de début et frais fixes de session.
 * Un abonnement actif applique ses kWh inclus du mois puis sa remise.
 */
class Tarification
{
    public function tarifApplicable(Borne $borne, ?CarbonInterface $date = null): ?Tarif
    {
        $date ??= now();

        foreach ([$borne->tarifSpecial, $borne->tarif] as $tarif) {
            if ($tarif && $tarif->estValide($date)) {
                return $tarif;
            }
        }

        return null;
    }

    public function enHeuresCreuses(Tarif $tarif, CarbonInterface $instant): bool
    {
        if ($tarif->prix_heures_creuses === null || ! $tarif->heures_creuses_debut || ! $tarif->heures_creuses_fin) {
            return false;
        }

        // Les heures creuses s'entendent dans le fuseau horaire de la plateforme (module 17).
        $heure = $instant->copy()->setTimezone(Parametre::get('fuseau_horaire', 'UTC'))->format('H:i:s');
        $debut = $tarif->heures_creuses_debut;
        $fin = $tarif->heures_creuses_fin;

        // Plage qui enjambe minuit (ex. 22:00 → 06:00).
        return $debut <= $fin
            ? $heure >= $debut && $heure < $fin
            : $heure >= $debut || $heure < $fin;
    }

    public function prixUnitaire(Tarif $tarif, CarbonInterface $instant): float
    {
        return $this->enHeuresCreuses($tarif, $instant) ? $tarif->prix_heures_creuses : $tarif->prix;
    }

    /**
     * Prix brut d'une consommation avec un tarif donné (utilisé aussi par le simulateur du back-office).
     */
    public function prixBrut(?Tarif $tarif, float $tarifKwhBorne, float $energieKwh, int $dureeSecondes, int $puissanceKw, CarbonInterface $debut): float
    {
        if (! $tarif) {
            return $energieKwh * $tarifKwhBorne;
        }

        $unitaire = $this->prixUnitaire($tarif, $debut);
        $heures = $dureeSecondes / 3600;

        $variable = match ($tarif->mode) {
            'minute' => $unitaire * $dureeSecondes / 60,
            'heure' => $unitaire * $heures,
            'puissance' => $unitaire * $puissanceKw * $heures,
            default => $unitaire * $energieKwh,
        };

        return $variable + $tarif->frais_session;
    }

    public function calculer(SessionRecharge $session): float
    {
        $session->loadMissing(['borne', 'connecteur', 'tarif', 'user']);

        $energie = $session->energie_kwh;
        $tarif = $session->tarif;
        $souscription = $session->user?->souscriptionActive();

        // kWh inclus dans l'abonnement, consommés au fil du mois (tarifs au kWh uniquement).
        if ($souscription && $souscription->abonnement->kwh_inclus > 0 && (! $tarif || $tarif->mode === 'kwh')) {
            $dejaConsomme = (float) SessionRecharge::where('user_id', $session->user_id)
                ->where('id', '!=', $session->id)
                ->where('etat', 'terminee')
                ->where('date_debut', '>=', $session->date_debut->copy()->startOfMonth())
                ->sum('energie_kwh');
            $energie = max(0, $energie - max(0, $souscription->abonnement->kwh_inclus - $dejaConsomme));
        }

        $prix = $this->prixBrut(
            $tarif,
            (float) $session->borne->tarif_kwh,
            $energie,
            $session->dureeEffectiveSecondes(),
            (int) ($session->connecteur->puissance_kw ?? $session->borne->puissance_kw ?? 0),
            $session->date_debut,
        );

        if ($souscription && $souscription->abonnement->remise_pourcent > 0) {
            $prix *= 1 - $souscription->abonnement->remise_pourcent / 100;
        }

        return round(max(0, $prix), 2);
    }

    /** Libellé lisible du tarif d'une borne, pour l'affichage. */
    public function libelle(Borne $borne): string
    {
        $tarif = $this->tarifApplicable($borne);
        if (! $tarif) {
            return number_format($borne->tarif_kwh, 3, ',', ' ').' / kWh';
        }

        $unite = ['kwh' => 'kWh', 'minute' => 'min', 'heure' => 'h', 'puissance' => 'kW·h'][$tarif->mode];

        return number_format($tarif->prix, 3, ',', ' ')." / {$unite}";
    }

    public static function pourUtilisateur(?User $user): ?string
    {
        return $user?->souscriptionActive()?->abonnement->nom;
    }
}
