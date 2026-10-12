<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AbonnementResource;
use App\Http\Resources\SouscriptionResource;
use App\Http\Resources\TarifResource;
use App\Models\Abonnement;
use App\Models\AuditLog;
use App\Models\Borne;
use App\Models\Parametre;
use App\Models\Souscription;
use App\Models\Tarif;
use App\Services\Tarification;
use App\Support\Perimetre;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/** Module 10 — tarifs (kWh, minute, heure, puissance, heures creuses, spéciaux) et abonnements. */
class AdminTarifController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return TarifResource::collection(Tarif::withCount('bornes')->orderByDesc('actif')->orderBy('nom')->get());
    }

    public function store(Request $request): TarifResource
    {
        // Un tarif créé par une station lui appartient ; celui du super-admin est un tarif plateforme.
        return new TarifResource(Tarif::create([...$this->valider($request), 'station_id' => app(Perimetre::class)->station()]));
    }

    public function update(Request $request, Tarif $tarif): TarifResource
    {
        $this->verifierProprietaire($tarif);
        $tarif->update($this->valider($request));

        return new TarifResource($tarif->loadCount('bornes'));
    }

    public function destroy(Tarif $tarif): JsonResponse
    {
        $this->verifierProprietaire($tarif);
        // Les sessions passées gardent la référence : on archive au lieu de supprimer.
        $tarif->update(['actif' => false]);
        Borne::where('tarif_id', $tarif->id)->update(['tarif_id' => null]);
        Borne::where('tarif_special_id', $tarif->id)->update(['tarif_special_id' => null]);

        return response()->json(['message' => 'Tarif archivé et retiré des bornes.']);
    }

    /** Applique un tarif (standard ou spécial) à un ensemble de bornes. */
    public function affecter(Request $request, Tarif $tarif): JsonResponse
    {
        $data = $request->validate([
            'borneIds' => ['required', 'array', 'min:1'],
            'borneIds.*' => ['integer', 'exists:bornes,id'],
            'special' => ['boolean'],
        ]);

        $colonne = ($data['special'] ?? $tarif->special) ? 'tarif_special_id' : 'tarif_id';
        Borne::whereIn('id', $data['borneIds'])->get()->each->update([$colonne => $tarif->id]);
        AuditLog::record($request->user()->id, 'affectation_tarif', 'tarif:'.$tarif->id, count($data['borneIds']).' borne(s)');

        return response()->json(['message' => 'Tarif appliqué à '.count($data['borneIds']).' borne(s).']);
    }

    /** Simulateur : prix d'une recharge type avec un tarif donné. */
    public function simuler(Request $request, Tarification $tarification): JsonResponse
    {
        $data = $request->validate([
            'tarifId' => ['required', 'exists:tarifs,id'],
            'energieKwh' => ['required', 'numeric', 'min:0'],
            'dureeMinutes' => ['required', 'integer', 'min:1'],
            'puissanceKw' => ['required', 'integer', 'min:1'],
            'heureDebut' => ['required', 'date_format:H:i'],
            'remisePourcent' => ['nullable', 'integer', 'between:0,100'],
        ]);

        $tarif = Tarif::findOrFail($data['tarifId']);
        $debut = Carbon::parse(today()->format('Y-m-d').' '.$data['heureDebut'], Parametre::get('fuseau_horaire', 'UTC'));
        $prix = $tarification->prixBrut($tarif, 0, $data['energieKwh'], $data['dureeMinutes'] * 60, $data['puissanceKw'], $debut);
        $remise = ($data['remisePourcent'] ?? 0) / 100;

        return response()->json([
            'heuresCreuses' => $tarification->enHeuresCreuses($tarif, $debut),
            'prixUnitaire' => $tarification->prixUnitaire($tarif, $debut),
            'prixBrut' => round($prix, 2),
            'prix' => round($prix * (1 - $remise), 2),
        ]);
    }

    // --- Abonnements ---

    public function abonnements(): AnonymousResourceCollection
    {
        return AbonnementResource::collection(
            Abonnement::withCount(['souscriptions as souscriptions_actives' => fn ($q) => $q->where('statut', 'active')])
                ->orderBy('prix_mensuel')
                ->get()
        );
    }

    public function storeAbonnement(Request $request): AbonnementResource
    {
        // Les abonnements clients sont communs à tout le réseau : gérés par la plateforme.
        abort_if(app(Perimetre::class)->actif(), 403, 'Les abonnements sont gérés par Volteo.');

        return new AbonnementResource(Abonnement::create($this->validerAbonnement($request)));
    }

    public function updateAbonnement(Request $request, Abonnement $abonnement): AbonnementResource
    {
        abort_if(app(Perimetre::class)->actif(), 403, 'Les abonnements sont gérés par Volteo.');
        $abonnement->update($this->validerAbonnement($request));

        return new AbonnementResource($abonnement);
    }

    public function souscriptions(Request $request): AnonymousResourceCollection
    {
        return SouscriptionResource::collection(
            Souscription::with(['user', 'abonnement'])
                ->when($request->query('statut'), fn ($q, $s) => $q->where('statut', $s))
                ->when($request->query('abonnement_id'), fn ($q, $id) => $q->where('abonnement_id', $id))
                ->latest()
                ->limit(500)
                ->get()
        );
    }

    private function valider(Request $request): array
    {
        $data = $request->validate([
            'nom' => ['required', 'string', 'max:100'],
            'mode' => ['required', Rule::in(Tarif::MODES)],
            'prix' => ['required', 'numeric', 'min:0'],
            'prixHeuresCreuses' => ['nullable', 'numeric', 'min:0'],
            'heuresCreusesDebut' => ['nullable', 'required_with:prixHeuresCreuses', 'date_format:H:i'],
            'heuresCreusesFin' => ['nullable', 'required_with:prixHeuresCreuses', 'date_format:H:i'],
            'fraisSession' => ['nullable', 'numeric', 'min:0'],
            'special' => ['boolean'],
            'valideDu' => ['nullable', 'date'],
            'valideAu' => ['nullable', 'date', 'after_or_equal:valideDu'],
            'actif' => ['boolean'],
            'description' => ['nullable', 'string', 'max:500'],
        ]);

        return [
            'nom' => $data['nom'],
            'mode' => $data['mode'],
            'prix' => $data['prix'],
            'prix_heures_creuses' => $data['prixHeuresCreuses'] ?? null,
            'heures_creuses_debut' => $data['heuresCreusesDebut'] ?? null,
            'heures_creuses_fin' => $data['heuresCreusesFin'] ?? null,
            'frais_session' => $data['fraisSession'] ?? 0,
            'special' => $data['special'] ?? false,
            'valide_du' => $data['valideDu'] ?? null,
            'valide_au' => $data['valideAu'] ?? null,
            'actif' => $data['actif'] ?? true,
            'description' => $data['description'] ?? null,
        ];
    }

    private function validerAbonnement(Request $request): array
    {
        $data = $request->validate([
            'nom' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:500'],
            'prixMensuel' => ['required', 'numeric', 'min:0'],
            'remisePourcent' => ['required', 'integer', 'between:0,100'],
            'kwhInclus' => ['required', 'integer', 'min:0'],
            'actif' => ['boolean'],
        ]);

        return [
            'nom' => $data['nom'],
            'description' => $data['description'] ?? null,
            'prix_mensuel' => $data['prixMensuel'],
            'remise_pourcent' => $data['remisePourcent'],
            'kwh_inclus' => $data['kwhInclus'],
            'actif' => $data['actif'] ?? true,
        ];
    }

    /** Une station ne modifie que ses propres tarifs (les tarifs plateforme sont en lecture seule). */
    private function verifierProprietaire(Tarif $tarif): void
    {
        $station = app(Perimetre::class)->station();
        abort_if($station && $tarif->station_id !== $station, 403, 'Ce tarif est défini par la plateforme : créez votre propre tarif.');
    }
}
