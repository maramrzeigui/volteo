<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BorneResource;
use App\Models\Borne;
use App\Models\Reservation;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class BorneController extends Controller
{
    private const RELATIONS = ['connecteurs', 'tarif', 'tarifSpecial'];

    public function index(): AnonymousResourceCollection
    {
        Reservation::expirerPerimees();

        return BorneResource::collection(Borne::with(self::RELATIONS)->ouvertesAuPublic()->orderBy('nom')->get());
    }

    /**
     * Fiche d'une borne par identifiant ou par référence OCPP : le QR code
     * collé sur la borne (borneapp://borne/BRN-TUN-001) ouvre directement sa fiche.
     */
    public function show(string $borne): BorneResource
    {
        Reservation::expirerPerimees();

        $trouvee = Borne::with(self::RELATIONS)
            ->ouvertesAuPublic()
            ->where(ctype_digit($borne) ? 'id' : 'reference', $borne)
            ->firstOrFail();

        return new BorneResource($trouvee);
    }
}
