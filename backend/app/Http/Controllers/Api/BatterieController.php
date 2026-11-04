<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BatterieResource;
use App\Models\Batterie;
use App\Models\User;
use App\Models\Vehicule;
use App\Services\Blockchain;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Côté conducteur : activer la batterie de son véhicule (le NFT lui est transféré), consulter son
 * passeport certifié et la céder à l'acheteur lors de la revente. Le passeport est aussi public :
 * un acheteur le vérifie avant d'acheter, en scannant le QR code de la batterie.
 */
class BatterieController extends Controller
{
    public function __construct(private Blockchain $blockchain) {}

    /** Batteries du conducteur, avec leur passeport lu dans la blockchain. */
    public function index(Request $request): JsonResponse
    {
        $batteries = Batterie::where('proprietaire_id', $request->user()->id)->with('vehicule')->latest('activee_le')->get();

        return response()->json([
            'data' => $batteries->map(fn (Batterie $b) => [
                ...(new BatterieResource($b))->resolve(),
                'vehicule' => $b->vehicule ? trim("{$b->vehicule->marque} {$b->vehicule->modele}") : null,
                'passeport' => $this->lirePasseport($b->num_serie),
            ]),
            'blockchain' => $this->blockchain->actif(),
        ]);
    }

    /** Activation : numéro de série (QR code) ou VIN + code d'activation de la facture. */
    public function activer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'numSerie' => ['required_without:vin', 'nullable', 'string', 'max:200'],
            'vin' => ['required_without:numSerie', 'nullable', 'string', 'max:17'],
            'code' => ['required', 'string', 'max:20'],
            'vehiculeId' => ['required', 'integer'],
        ]);
        $user = $request->user();

        // Limite les essais de code : 5 erreurs par heure et par compte.
        $cleEssais = 'activation-batterie:'.$user->id;
        if (Cache::get($cleEssais, 0) >= 5) {
            throw ValidationException::withMessages(['code' => ['Trop d’essais. Réessayez dans une heure.']]);
        }

        $batterie = $this->trouver($data['numSerie'] ?? null, $data['vin'] ?? null);
        if (! $batterie || ! $batterie->codeValide($data['code'])) {
            Cache::put($cleEssais, Cache::get($cleEssais, 0) + 1, now()->addHour());
            throw ValidationException::withMessages(['code' => ['Batterie introuvable ou code d’activation incorrect.']]);
        }
        if ($batterie->statut === 'activee') {
            throw ValidationException::withMessages(['code' => ['Cette batterie est déjà activée par son propriétaire.']]);
        }
        abort_unless($batterie->statut === 'creee', 409, 'Le NFT de cette batterie n’est pas encore créé.');

        $vehicule = Vehicule::withoutGlobalScopes()->where('user_id', $user->id)->findOrFail($data['vehiculeId']);

        try {
            $transfert = $this->blockchain->transferer('fabricant:'.$batterie->fabricant_id, $batterie->num_serie, 'user:'.$user->id);
        } catch (RuntimeException $e) {
            abort(503, $e->getMessage());
        }

        DB::transaction(function () use ($batterie, $user, $vehicule, $transfert) {
            Batterie::where('vehicule_id', $vehicule->id)->where('id', '!=', $batterie->id)->update(['vehicule_id' => null]);
            $batterie->update([
                'statut' => 'activee',
                'proprietaire_id' => $user->id,
                'vehicule_id' => $vehicule->id,
                'tx_transfert' => $transfert['tx'],
                'activee_le' => now(),
            ]);
        });
        Cache::forget($cleEssais);

        return response()->json(['data' => new BatterieResource($batterie->fresh()), 'passeport' => $this->lirePasseport($batterie->num_serie)]);
    }

    /** Revente : le NFT passe au compte Volteo de l'acheteur, l'historique suit la batterie. */
    public function ceder(Request $request, Batterie $batterie): JsonResponse
    {
        abort_unless($batterie->proprietaire_id === $request->user()->id, 404);
        $data = $request->validate(['email' => ['required', 'email']]);
        $acheteur = User::where('email', $data['email'])->where('role', 'client')->first();
        if (! $acheteur || $acheteur->id === $request->user()->id) {
            throw ValidationException::withMessages(['email' => ['Aucun autre compte conducteur Volteo avec cet e-mail.']]);
        }

        try {
            $transfert = $this->blockchain->transferer('user:'.$request->user()->id, $batterie->num_serie, 'user:'.$acheteur->id);
        } catch (RuntimeException $e) {
            abort(503, $e->getMessage());
        }
        $batterie->update(['proprietaire_id' => $acheteur->id, 'vehicule_id' => null, 'tx_transfert' => $transfert['tx']]);

        return response()->json(['data' => new BatterieResource($batterie->fresh()), 'message' => 'Batterie transférée à '.trim("{$acheteur->prenom} {$acheteur->nom}").'.']);
    }

    /** Passeport public (lecture de la blockchain) : ce que voit l'acheteur en scannant le QR code. */
    public function passeport(string $numSerie): JsonResponse
    {
        $numSerie = $this->numSerieDepuisQr($numSerie);
        try {
            return response()->json(['data' => $this->blockchain->passeport($numSerie)]);
        } catch (RuntimeException $e) {
            abort($e->getCode() === 404 ? 404 : 503, $e->getMessage());
        }
    }

    private function trouver(?string $numSerie, ?string $vin): ?Batterie
    {
        if ($numSerie) {
            return Batterie::where('num_serie', $this->numSerieDepuisQr($numSerie))->first();
        }

        return Batterie::where('vin', strtoupper(trim((string) $vin)))->where('statut', '!=', 'activee')->latest()->first()
            ?? Batterie::where('vin', strtoupper(trim((string) $vin)))->latest()->first();
    }

    /** Le QR code contient l'URL du passeport (…/batterie/BAT-001) ou le numéro de série seul. */
    private function numSerieDepuisQr(string $valeur): string
    {
        $valeur = trim(urldecode($valeur));
        if (str_contains($valeur, '/')) {
            $valeur = basename(parse_url($valeur, PHP_URL_PATH) ?: $valeur);
        }

        return strtoupper($valeur);
    }

    private function lirePasseport(string $numSerie): ?array
    {
        try {
            return $this->blockchain->passeport($numSerie);
        } catch (RuntimeException) {
            return null;
        }
    }
}
