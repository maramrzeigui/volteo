<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VehiculeResource;
use App\Models\BadgeRfid;
use App\Models\Borne;
use App\Models\SessionRecharge;
use App\Services\OcppClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Simulateur de recharge au badge RFID : pilote une borne du simulateur SAP comme le ferait
 * le client sur place (présenter le badge, brancher le câble, démarrer, arrêter). La borne émet
 * de vraies trames OCPP 1.6 vers le serveur ; la session et la facture sont réelles.
 */
class SimulateurRechargeController extends Controller
{
    public function __construct(private readonly OcppClient $ocpp) {}

    public function contexte(Request $request): JsonResponse
    {
        $this->verifierActif();
        $user = $request->user();
        $connectees = $this->ocpp->bornesConnectees() ?? [];

        return response()->json([
            'badges' => $user->badges()->get()->map(fn (BadgeRfid $b) => ['id' => $b->id, 'uid' => $b->uid, 'libelle' => $b->libelle, 'statut' => $b->statutOcpp()])->values(),
            'vehicules' => VehiculeResource::collection($user->vehicules()->get()),
            'bornes' => Borne::ouvertesAuPublic()->where('source', 'reseau')->whereIn('reference', $connectees)->with('connecteurs')->orderBy('nom')->get()
                ->map(fn (Borne $b) => [
                    'id' => $b->id, 'nom' => $b->nom, 'reference' => $b->reference, 'adresse' => $b->adresse, 'puissanceKw' => $b->puissance_kw,
                    'photoUrl' => $b->photo ? '/storage/'.$b->photo : null, 'photoCredit' => $b->photo ? $b->photo_credit : null, 'etat' => $b->etat,
                    'connecteurs' => $b->connecteurs->values()->map(fn ($c, $i) => ['numero' => OcppClient::numero($c), 'type' => $c->type, 'puissanceKw' => $c->puissance_kw, 'etat' => $c->etat]),
                ])->values(),
            'soldeWallet' => (float) $user->solde_wallet,
        ]);
    }

    /** État de la borne simulée, journal OCPP et session du client sur cette borne. */
    public function etat(Request $request, Borne $borne): JsonResponse
    {
        $this->verifierActif();
        $etat = $this->ocpp->simulateur('etat', ['reference' => $borne->reference]);
        $journal = $this->ocpp->simulateur('journal', ['reference' => $borne->reference]);
        $session = SessionRecharge::where('user_id', $request->user()->id)->where('borne_id', $borne->id)->latest('id')->first();

        return response()->json([
            'borne' => $etat['donnees'] ?? null,
            'erreur' => $etat['ok'] ? null : $etat['message'],
            'journal' => $journal['donnees'] ?? [],
            'session' => $session ? [
                'id' => $session->id, 'etat' => $session->etat, 'debut' => $session->date_debut?->toIso8601String(), 'fin' => $session->date_fin?->toIso8601String(),
                'energieKwh' => (float) $session->energie_kwh, 'prix' => (float) $session->prix, 'puissanceKw' => (float) $session->puissance_instantanee_kw,
                'batterie' => $session->pourcentage_batterie, 'transactionOcpp' => $session->transaction_ocpp_id, 'modeDemarrage' => $session->mode_demarrage,
            ] : null,
        ]);
    }

    public function action(Request $request, Borne $borne, string $action): JsonResponse
    {
        $this->verifierActif();
        $data = $request->validate(['badge_id' => ['nullable', 'integer'], 'connecteur' => ['nullable', 'integer', 'min:1']]);
        $badge = isset($data['badge_id']) ? $request->user()->badges()->findOrFail($data['badge_id']) : null;
        $connecteur = $data['connecteur'] ?? 1;

        $r = match ($action) {
            'badge' => $this->ocpp->simulateur('badge', ['reference' => $borne->reference, 'idTag' => $badge?->uid ?? abort(422, 'Choisissez un badge.')]),
            'brancher' => $this->ocpp->simulateur('brancher', ['reference' => $borne->reference, 'connecteurId' => $connecteur]),
            'demarrer' => $this->ocpp->simulateur('demarrer', ['reference' => $borne->reference, 'connecteurId' => $connecteur, 'idTag' => $badge?->uid ?? abort(422, 'Choisissez un badge.')]),
            'arreter' => (function () use ($borne, $request) {
                $session = SessionRecharge::where('user_id', $request->user()->id)->where('borne_id', $borne->id)->whereIn('etat', SessionRecharge::ETATS_ACTIFS)->latest('id')->first();
                abort_unless($session && $session->transaction_ocpp_id, 422, 'Aucune recharge en cours sur cette borne.');

                return $this->ocpp->simulateur('arreter', ['reference' => $borne->reference, 'transactionId' => (int) $session->transaction_ocpp_id]);
            })(),
            default => abort(404),
        };

        // Réponse de la supervision au badge (Authorize) : celle que la borne vient de recevoir.
        $autorisation = $action === 'badge' && $badge ? $badge->statutOcpp() : null;
        $motif = $autorisation === 'Accepted' ? $request->user()->motifRefusRecharge() : null;
        if ($motif) {
            $autorisation = 'Blocked';
        }

        return response()->json(['ok' => $r['ok'], 'message' => $motif ?? $r['message'], 'autorisation' => $autorisation], $r['ok'] ? 200 : 502);
    }

    private function verifierActif(): void
    {
        abort_unless(config('services.ocpp.simulateur') && ! app()->isProduction(), 404, 'Simulateur indisponible.');
    }
}
