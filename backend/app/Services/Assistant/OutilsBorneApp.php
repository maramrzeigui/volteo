<?php

namespace App\Services\Assistant;

use App\Models\Abonnement;
use App\Models\Borne;
use App\Models\Connecteur;
use App\Models\Parametre;
use App\Models\Reservation;
use App\Models\SessionRecharge;
use App\Models\User;
use App\Services\Tarification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Outils de l'assistant : lecture seule, limités au client connecté. Chaque
 * outil renvoie un résultat JSON pour le modèle et des « cartes » que l'app
 * affiche dans la conversation (borne, estimation, compte, recharge).
 *
 * Les définitions sont triées et figées : elles font partie du préfixe de la
 * conversation (cache de prompt et blocs de réflexion liés à ce préfixe).
 */
class OutilsBorneApp
{
    private const MAX_BORNES = 6;

    public function __construct(private readonly Tarification $tarification) {}

    /** @return list<array<string, mixed>> */
    public function definitions(): array
    {
        return [
            [
                'name' => 'details_borne',
                'description' => 'Fiche complète d’une borne : état en direct, prises (type, puissance, disponibilité), tarif applicable (mode, prix, heures creuses, frais de session, tarif promotionnel), adresse. À utiliser dès que le client parle d’une borne précise (nom, ville ou référence BRN-…).',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'recherche' => ['type' => 'string', 'description' => 'Référence (ex. BRN-TUN-001), nom ou partie du nom de la borne.'],
                    ],
                    'required' => ['recherche'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'name' => 'estimer_recharge',
                'description' => 'Estime le prix et la durée d’une recharge sur une borne, avec le tarif réel (heures creuses comprises) et la remise de l’abonnement du client. Donner soit l’énergie en kWh, soit les pourcentages de batterie de départ et d’arrivée (la capacité du véhicule du client est utilisée).',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'recherche' => ['type' => 'string', 'description' => 'Référence ou nom de la borne.'],
                        'energie_kwh' => ['type' => 'number', 'description' => 'Énergie à recharger en kWh.'],
                        'batterie_depart' => ['type' => 'integer', 'description' => 'Niveau de batterie actuel en %.'],
                        'batterie_objectif' => ['type' => 'integer', 'description' => 'Niveau de batterie souhaité en %.'],
                        'type_prise' => ['type' => 'string', 'enum' => Connecteur::TYPES, 'description' => 'Prise souhaitée ; par défaut la plus puissante.'],
                    ],
                    'required' => ['recherche'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'name' => 'mes_recharges',
                'description' => 'Recharge en cours du client (énergie, puissance, batterie, coût en direct), ses dernières recharges et sa consommation du mois.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'nombre' => ['type' => 'integer', 'description' => 'Nombre de recharges passées à lister (1 à 10, 5 par défaut).'],
                    ],
                    'additionalProperties' => false,
                ],
            ],
            [
                'name' => 'mon_compte',
                'description' => 'Compte du client : solde du wallet, paiements à régler, abonnement (remise, kWh inclus restants ce mois), véhicules, badges RFID et réservation en cours.',
                'input_schema' => ['type' => 'object', 'properties' => new \stdClass, 'additionalProperties' => false],
            ],
            [
                'name' => 'offres_abonnement',
                'description' => 'Formules d’abonnement proposées (prix mensuel, remise, kWh inclus) et formule actuelle du client.',
                'input_schema' => ['type' => 'object', 'properties' => new \stdClass, 'additionalProperties' => false],
            ],
            [
                'name' => 'rechercher_bornes',
                'description' => 'Recherche des bornes du réseau Volteo (et des bornes publiques d’autres opérateurs) avec leur état en direct. Filtres facultatifs : ville ou quartier, disponibilité immédiate, puissance minimale, type de prise, position du client pour trier par distance.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'lieu' => ['type' => 'string', 'description' => 'Ville, quartier ou adresse (ex. Tunis, La Marsa, Sousse).'],
                        'disponible_maintenant' => ['type' => 'boolean', 'description' => 'Uniquement les bornes avec une prise libre maintenant.'],
                        'puissance_min_kw' => ['type' => 'integer', 'description' => 'Puissance minimale en kW (50 et plus = charge rapide).'],
                        'type_prise' => ['type' => 'string', 'enum' => Connecteur::TYPES],
                        'latitude' => ['type' => 'number'],
                        'longitude' => ['type' => 'number'],
                    ],
                    'additionalProperties' => false,
                ],
            ],
        ];
    }

    /**
     * Exécute un outil. Une entrée invalide renvoie une erreur lisible pour le modèle.
     *
     * @return array{resultat: array<string, mixed>, cartes: list<array<string, mixed>>, erreur: bool}
     */
    public function executer(string $nom, array $entree, User $user): array
    {
        try {
            return match ($nom) {
                'rechercher_bornes' => $this->rechercherBornes($entree),
                'details_borne' => $this->detailsBorne($entree),
                'estimer_recharge' => $this->estimerRecharge($entree, $user),
                'mon_compte' => $this->monCompte($user),
                'mes_recharges' => $this->mesRecharges($entree, $user),
                'offres_abonnement' => $this->offresAbonnement($user),
                default => $this->erreur("Outil inconnu : {$nom}"),
            };
        } catch (ValidationException $e) {
            return $this->erreur('Paramètres invalides : '.collect($e->errors())->flatten()->join(' '));
        }
    }

    // ------------------------------------------------------------------ Outils

    private function rechercherBornes(array $entree): array
    {
        $f = Validator::make($entree, [
            'lieu' => ['nullable', 'string', 'max:100'],
            'disponible_maintenant' => ['nullable', 'boolean'],
            'puissance_min_kw' => ['nullable', 'integer', 'min:1', 'max:500'],
            'type_prise' => ['nullable', Rule::in(Connecteur::TYPES)],
            'latitude' => ['nullable', 'numeric', 'between:-90,90', 'required_with:longitude'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180', 'required_with:latitude'],
        ])->validate();

        Reservation::expirerPerimees();

        $bornes = Borne::with(['connecteurs', 'tarif', 'tarifSpecial'])->ouvertesAuPublic()
            ->when($f['lieu'] ?? null, fn ($q, $lieu) => $q->where(fn ($w) => $w
                ->where('adresse', 'like', "%{$lieu}%")->orWhere('nom', 'like', "%{$lieu}%")->orWhere('site', 'like', "%{$lieu}%")))
            ->get()
            ->filter(function (Borne $b) use ($f) {
                $prises = $b->connecteurs
                    ->when($f['type_prise'] ?? null, fn (Collection $c, $t) => $c->where('type', $t))
                    ->when($f['puissance_min_kw'] ?? null, fn (Collection $c, $p) => $c->where('puissance_kw', '>=', $p));
                if ($prises->isEmpty() && (($f['type_prise'] ?? null) || ($f['puissance_min_kw'] ?? null))) {
                    return false;
                }
                if (! empty($f['disponible_maintenant'])) {
                    return $b->source !== 'publique' && $b->accepteRecharge() && $prises->contains('etat', 'disponible');
                }

                return true;
            });

        if (isset($f['latitude'])) {
            $bornes = $bornes->each(fn (Borne $b) => $b->setAttribute('distance_km', $this->distanceKm($f['latitude'], $f['longitude'], $b->latitude, $b->longitude)))
                ->sortBy('distance_km');
        } else {
            // Réseau Volteo d'abord, puis bornes libres, puis les plus puissantes.
            $bornes = $bornes->sortBy([
                fn (Borne $a, Borne $b) => ($a->source === 'publique') <=> ($b->source === 'publique'),
                fn (Borne $a, Borne $b) => $this->nbLibres($b) <=> $this->nbLibres($a),
                fn (Borne $a, Borne $b) => ($b->puissance_kw ?? 0) <=> ($a->puissance_kw ?? 0),
            ]);
        }

        $total = $bornes->count();
        $retenues = $bornes->take(self::MAX_BORNES)->values();

        return [
            'resultat' => [
                'nombre_trouve' => $total,
                'bornes' => $retenues->map(fn (Borne $b) => $this->resumeBorne($b))->all(),
            ],
            'cartes' => $retenues->map(fn (Borne $b) => $this->carteBorne($b))->all(),
            'erreur' => false,
        ];
    }

    private function detailsBorne(array $entree): array
    {
        $f = Validator::make($entree, ['recherche' => ['required', 'string', 'max:100']])->validate();
        $borne = $this->trouverBorne($f['recherche']);
        if (! $borne) {
            return $this->erreur("Aucune borne ne correspond à « {$f['recherche']} ».");
        }

        $tarif = $this->tarification->tarifApplicable($borne);

        return [
            'resultat' => [
                ...$this->resumeBorne($borne),
                'tarif' => $tarif ? [
                    'nom' => $tarif->nom,
                    'mode' => $tarif->mode,
                    'prix' => $tarif->prix,
                    'unite' => ['kwh' => 'kWh', 'minute' => 'minute', 'heure' => 'heure', 'puissance' => 'kW·h'][$tarif->mode],
                    'prix_heures_creuses' => $tarif->prix_heures_creuses,
                    'heures_creuses' => $tarif->heures_creuses_debut ? substr($tarif->heures_creuses_debut, 0, 5).'–'.substr($tarif->heures_creuses_fin, 0, 5) : null,
                    'frais_session' => $tarif->frais_session,
                    'tarif_promotionnel' => (bool) $tarif->special,
                    'valable_jusqu_au' => $tarif->valide_au?->format('Y-m-d'),
                ] : ['mode' => 'kwh', 'prix' => $borne->tarif_kwh, 'unite' => 'kWh'],
                'derniere_communication' => $borne->dernier_heartbeat?->toIso8601String(),
                'hors_ligne_depuis' => $borne->etat === 'deconnectee' ? $borne->deconnectee_le?->toIso8601String() : null,
            ],
            'cartes' => [$this->carteBorne($borne)],
            'erreur' => false,
        ];
    }

    private function estimerRecharge(array $entree, User $user): array
    {
        $f = Validator::make($entree, [
            'recherche' => ['required', 'string', 'max:100'],
            'energie_kwh' => ['nullable', 'numeric', 'min:0.1', 'max:300'],
            'batterie_depart' => ['nullable', 'integer', 'between:0,100'],
            'batterie_objectif' => ['nullable', 'integer', 'between:1,100', 'gt:batterie_depart'],
            'type_prise' => ['nullable', Rule::in(Connecteur::TYPES)],
        ])->validate();

        $borne = $this->trouverBorne($f['recherche']);
        if (! $borne) {
            return $this->erreur("Aucune borne ne correspond à « {$f['recherche']} ».");
        }
        if ($borne->source === 'publique') {
            return $this->erreur('Borne publique d’un autre opérateur : son tarif n’est pas connu de Volteo.');
        }

        $vehicule = $user->vehicules()->first();
        $capacite = (float) ($vehicule?->capacite_batterie_kwh ?? 60);
        $energie = isset($f['energie_kwh'])
            ? (float) $f['energie_kwh']
            : $capacite * (($f['batterie_objectif'] ?? 80) - ($f['batterie_depart'] ?? 20)) / 100;
        if ($energie <= 0) {
            return $this->erreur('Indiquez l’énergie en kWh ou les niveaux de batterie de départ et d’arrivée.');
        }

        $prise = $borne->connecteurs
            ->when($f['type_prise'] ?? null, fn (Collection $c, $t) => $c->where('type', $t))
            ->sortByDesc('puissance_kw')->first();
        if (! $prise) {
            return $this->erreur('Cette borne n’a pas de prise de ce type.');
        }

        // Puissance moyenne réaliste : ~85 % de la puissance nominale (fin de charge plus lente).
        $puissanceMoyenne = max(1, $prise->puissance_kw * 0.85);
        $dureeSecondes = (int) round($energie / $puissanceMoyenne * 3600);
        $tarif = $this->tarification->tarifApplicable($borne);

        $souscription = $user->souscriptionActive();
        $energieFacturee = $energie;
        $kwhOfferts = 0.0;
        if ($souscription && $souscription->abonnement->kwh_inclus > 0 && (! $tarif || $tarif->mode === 'kwh')) {
            $restants = $this->kwhInclusRestants($user, $souscription->abonnement->kwh_inclus);
            $kwhOfferts = min($energie, $restants);
            $energieFacturee = $energie - $kwhOfferts;
        }

        $brut = $this->tarification->prixBrut($tarif, (float) $borne->tarif_kwh, $energieFacturee, $dureeSecondes, (int) $prise->puissance_kw, now());
        $remise = $souscription?->abonnement->remise_pourcent ?? 0;
        $prix = round(max(0, $brut * (1 - $remise / 100)), 2);
        $devise = Parametre::get('devise', 'DT');

        $resultat = [
            'borne' => $borne->nom,
            'prise' => "{$prise->type} {$prise->puissance_kw} kW",
            'energie_kwh' => round($energie, 1),
            'duree_minutes' => (int) ceil($dureeSecondes / 60),
            'prix_estime' => $prix,
            'devise' => $devise,
            'kwh_offerts_abonnement' => round($kwhOfferts, 1),
            'remise_abonnement_pourcent' => $remise,
            'heures_creuses_maintenant' => $tarif ? $this->tarification->enHeuresCreuses($tarif, now()) : false,
            'vehicule' => $vehicule ? "{$vehicule->marque} {$vehicule->modele} ({$vehicule->capacite_batterie_kwh} kWh)" : 'aucun véhicule enregistré (60 kWh supposés)',
            'note' => 'Estimation : le prix final dépend de l’énergie réellement délivrée et de l’heure de début.',
        ];

        return [
            'resultat' => $resultat,
            'cartes' => [[
                'type' => 'estimation',
                'borneId' => $borne->id,
                'borneNom' => $borne->nom,
                'prise' => $resultat['prise'],
                'energieKwh' => $resultat['energie_kwh'],
                'dureeMinutes' => $resultat['duree_minutes'],
                'prix' => $prix,
                'devise' => $devise,
                'remisePourcent' => $remise,
                'kwhOfferts' => $resultat['kwh_offerts_abonnement'],
            ]],
            'erreur' => false,
        ];
    }

    private function monCompte(User $user): array
    {
        $souscription = $user->souscriptionActive();
        $impayes = (float) $user->paiements()->where('statut', 'en_attente')->sum('montant');
        $reservation = Reservation::with('borne')->where('user_id', $user->id)->where('statut', 'active')->first();
        $devise = Parametre::get('devise', 'DT');

        $resultat = [
            'prenom' => $user->prenom,
            'solde_wallet' => (float) $user->solde_wallet,
            'devise' => $devise,
            'paiements_a_regler' => $impayes,
            'abonnement' => $souscription ? [
                'formule' => $souscription->abonnement->nom,
                'remise_pourcent' => $souscription->abonnement->remise_pourcent,
                'kwh_inclus_par_mois' => $souscription->abonnement->kwh_inclus,
                'kwh_inclus_restants_ce_mois' => $this->kwhInclusRestants($user, $souscription->abonnement->kwh_inclus),
                'valable_jusqu_au' => $souscription->date_fin->format('Y-m-d'),
                'renouvellement_automatique' => (bool) $souscription->renouvellement_auto,
            ] : null,
            'vehicules' => $user->vehicules->map(fn ($v) => "{$v->marque} {$v->modele} · {$v->type_connecteur} · {$v->capacite_batterie_kwh} kWh")->all(),
            'badges_rfid' => $user->badges->map(fn ($b) => ['libelle' => $b->libelle ?? 'Badge', 'statut' => $b->statutOcpp()])->all(),
            'reservation_en_cours' => $reservation ? ['borne' => $reservation->borne->nom, 'expire_a' => $reservation->expire_le->toIso8601String()] : null,
        ];

        return [
            'resultat' => $resultat,
            'cartes' => [[
                'type' => 'compte',
                'soldeWallet' => $resultat['solde_wallet'],
                'devise' => $devise,
                'aRegler' => $impayes,
                'abonnement' => $souscription?->abonnement->nom,
                'kwhRestants' => $resultat['abonnement']['kwh_inclus_restants_ce_mois'] ?? null,
            ]],
            'erreur' => false,
        ];
    }

    private function mesRecharges(array $entree, User $user): array
    {
        $f = Validator::make($entree, ['nombre' => ['nullable', 'integer', 'between:1,10']])->validate();

        $active = $user->sessions()->with(['borne', 'connecteur'])->whereIn('etat', SessionRecharge::ETATS_ACTIFS)->latest('date_debut')->first();
        $passees = $user->sessions()->with('borne')->where('etat', 'terminee')->latest('date_debut')->limit($f['nombre'] ?? 5)->get();
        $mois = $user->sessions()->where('etat', 'terminee')->where('date_debut', '>=', now()->startOfMonth());

        $resultat = [
            'recharge_en_cours' => $active ? [
                'borne' => $active->borne->nom,
                'etat' => $active->etat,
                'energie_kwh' => $active->energie_kwh,
                'puissance_kw' => $active->puissance_instantanee_kw,
                'batterie_pourcent' => $active->pourcentage_batterie,
                'cout_actuel' => $active->prix,
                'depuis' => $active->date_debut->toIso8601String(),
            ] : null,
            'dernieres_recharges' => $passees->map(fn (SessionRecharge $s) => [
                'date' => $s->date_debut->toDateString(),
                'borne' => $s->borne->nom,
                'energie_kwh' => $s->energie_kwh,
                'prix' => $s->prix,
            ])->all(),
            'ce_mois' => [
                'recharges' => (clone $mois)->count(),
                'energie_kwh' => round((float) (clone $mois)->sum('energie_kwh'), 1),
                'depenses' => round((float) (clone $mois)->sum('prix'), 2),
            ],
        ];

        return [
            'resultat' => $resultat,
            'cartes' => $active ? [[
                'type' => 'recharge',
                'sessionId' => $active->id,
                'borneNom' => $active->borne->nom,
                'energieKwh' => $active->energie_kwh,
                'puissanceKw' => $active->puissance_instantanee_kw,
                'batterie' => $active->pourcentage_batterie,
                'prix' => $active->prix,
                'enPause' => $active->etat === 'en_pause',
            ]] : [],
            'erreur' => false,
        ];
    }

    private function offresAbonnement(User $user): array
    {
        $actuelle = $user->souscriptionActive()?->abonnement;

        return [
            'resultat' => [
                'devise' => Parametre::get('devise', 'DT'),
                'formule_actuelle' => $actuelle?->nom,
                'formules' => Abonnement::where('actif', true)->orderBy('prix_mensuel')->get()->map(fn (Abonnement $a) => [
                    'nom' => $a->nom,
                    'description' => $a->description,
                    'prix_mensuel' => $a->prix_mensuel,
                    'remise_pourcent' => $a->remise_pourcent,
                    'kwh_inclus_par_mois' => $a->kwh_inclus,
                ])->all(),
            ],
            'cartes' => [],
            'erreur' => false,
        ];
    }

    // ------------------------------------------------------------------ Aides

    private function trouverBorne(string $recherche): ?Borne
    {
        $recherche = trim($recherche);

        return Borne::with(['connecteurs', 'tarif', 'tarifSpecial'])->ouvertesAuPublic()->where('reference', $recherche)->first()
            ?? Borne::with(['connecteurs', 'tarif', 'tarifSpecial'])->ouvertesAuPublic()
                ->where(fn ($q) => $q->where('nom', 'like', "%{$recherche}%")->orWhere('adresse', 'like', "%{$recherche}%"))
                ->orderByRaw("source = 'publique'")
                ->first();
    }

    private function resumeBorne(Borne $b): array
    {
        return array_filter([
            'reference' => $b->reference,
            'nom' => $b->nom,
            'adresse' => $b->adresse,
            'reseau' => $b->source === 'publique' ? ($b->operateur ?? 'autre opérateur') : 'Volteo',
            'etat' => $b->etat,
            'peut_recharger_maintenant' => $b->source !== 'publique' && $b->accepteRecharge() && $this->nbLibres($b) > 0,
            'prises' => $b->connecteurs->map(fn (Connecteur $c) => "{$c->type} {$c->puissance_kw} kW : {$c->etat}")->all(),
            'puissance_max_kw' => $b->puissance_kw,
            'tarif' => $b->source === 'publique' ? null : $this->tarification->libelle($b),
            'distance_km' => $b->getAttribute('distance_km'),
        ], fn ($v) => $v !== null);
    }

    private function carteBorne(Borne $b): array
    {
        return [
            'type' => 'borne',
            'borneId' => $b->id,
            'reference' => $b->reference,
            'nom' => $b->nom,
            'adresse' => $b->adresse,
            'etat' => $b->etat,
            'source' => $b->source,
            'puissanceKw' => $b->puissance_kw,
            'priseLibres' => $b->source === 'publique' || ! $b->accepteRecharge() ? 0 : $this->nbLibres($b),
            'prisesTotal' => $b->connecteurs->count(),
            'tarif' => $b->source === 'publique' ? null : $this->libelleTarif($b),
            'distanceKm' => $b->getAttribute('distance_km'),
        ];
    }

    /** « 0,450 DT / kWh » : libellé du tarif avec la devise de la plateforme. */
    private function libelleTarif(Borne $b): string
    {
        return str_replace(' / ', ' '.Parametre::get('devise', 'DT').' / ', $this->tarification->libelle($b));
    }

    private function nbLibres(Borne $b): int
    {
        return $b->connecteurs->where('etat', 'disponible')->count();
    }

    private function kwhInclusRestants(User $user, float $inclus): float
    {
        $consommes = (float) $user->sessions()->where('etat', 'terminee')
            ->where('date_debut', '>=', now()->startOfMonth())->sum('energie_kwh');

        return round(max(0, $inclus - $consommes), 1);
    }

    private function distanceKm(float $lat1, float $lon1, ?float $lat2, ?float $lon2): ?float
    {
        if ($lat2 === null || $lon2 === null) {
            return null;
        }
        $r = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;

        return round(2 * $r * asin(sqrt($a)), 1);
    }

    private function erreur(string $message): array
    {
        return ['resultat' => ['erreur' => $message], 'cartes' => [], 'erreur' => true];
    }
}
