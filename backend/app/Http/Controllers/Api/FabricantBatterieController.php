<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BatterieResource;
use App\Models\Batterie;
use App\Services\Blockchain;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use RuntimeException;

/**
 * Espace fabricant : chaque batterie produite reçoit son NFT dans la blockchain (BatteryPassport),
 * une étiquette QR et un code d'activation à remettre à l'acheteur du véhicule.
 */
class FabricantBatterieController extends Controller
{
    public function __construct(private Blockchain $blockchain) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $batteries = Batterie::where('fabricant_id', $request->user()->id)
            ->with('proprietaire')
            ->when($request->query('q'), fn ($q, $t) => $q->where(fn ($w) => $w->where('num_serie', 'like', "%{$t}%")->orWhere('vin', 'like', "%{$t}%")))
            ->latest()
            ->get();

        return BatterieResource::collection($batteries)->additional(['blockchain' => $this->blockchain->actif()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'numSerie' => ['required', 'string', 'max:40', 'regex:/^[A-Za-z0-9\-]+$/', Rule::unique('batteries', 'num_serie')],
            'modele' => ['required', 'string', 'max:80'],
            'chimie' => ['nullable', 'string', 'max:20'],
            'capaciteKwh' => ['required', 'integer', 'min:1', 'max:300'],
            'vin' => ['nullable', 'string', 'size:17', 'regex:/^[A-HJ-NPR-Z0-9]{17}$/i'],
        ], [
            'vin.size' => 'Le VIN compte exactement 17 caractères.',
            'vin.regex' => 'VIN invalide (lettres I, O et Q interdites).',
            'numSerie.unique' => 'Ce numéro de série est déjà enregistré.',
        ]);

        $batterie = Batterie::create([
            'fabricant_id' => $request->user()->id,
            'num_serie' => strtoupper($data['numSerie']),
            'modele' => $data['modele'],
            'chimie' => $data['chimie'] ?? null,
            'capacite_kwh' => $data['capaciteKwh'],
            'vin' => isset($data['vin']) ? strtoupper($data['vin']) : null,
            'code_activation' => Batterie::nouveauCode(),
        ]);

        $this->creerNft($batterie, $request->user()->id, $request->user()->name);

        return (new BatterieResource($batterie->fresh()))->avecCode()->response()->setStatusCode(201);
    }

    public function show(Request $request, Batterie $batterie): JsonResponse
    {
        abort_unless($batterie->fabricant_id === $request->user()->id, 404);

        return response()->json([
            'data' => (new BatterieResource($batterie->load('proprietaire')))->avecCode(),
            'passeport' => $this->lirePasseport($batterie),
        ]);
    }

    /** Nouvel essai après une panne du pont blockchain. */
    public function reessayer(Request $request, Batterie $batterie): BatterieResource
    {
        abort_unless($batterie->fabricant_id === $request->user()->id, 404);
        abort_unless(in_array($batterie->statut, ['en_attente', 'echec'], true), 409, 'Le NFT de cette batterie existe déjà.');
        $this->creerNft($batterie, $request->user()->id, $request->user()->name);

        return (new BatterieResource($batterie->fresh()))->avecCode();
    }

    private function creerNft(Batterie $batterie, int $fabricantId, string $nom): void
    {
        try {
            $ref = 'fabricant:'.$fabricantId;
            $this->blockchain->portefeuille($ref, 'fabricant', $nom);
            $nft = $this->blockchain->creerBatterie($ref, [
                'numSerie' => $batterie->num_serie,
                'modele' => $batterie->modele,
                'chimie' => $batterie->chimie,
                'capaciteKWh' => $batterie->capacite_kwh,
                'vin' => $batterie->vin,
            ]);
            $batterie->update(['statut' => 'creee', 'token_id' => $nft['tokenId'], 'tx_creation' => $nft['tx'], 'erreur' => null]);
        } catch (RuntimeException $e) {
            $batterie->update(['statut' => 'echec', 'erreur' => mb_substr($e->getMessage(), 0, 250)]);
        }
    }

    private function lirePasseport(Batterie $batterie): ?array
    {
        if (! $batterie->token_id) {
            return null;
        }
        try {
            return $this->blockchain->passeport($batterie->num_serie);
        } catch (RuntimeException) {
            return null;
        }
    }
}
