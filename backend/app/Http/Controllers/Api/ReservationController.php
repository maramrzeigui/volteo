<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Connecteur;
use App\Models\Reservation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReservationController extends Controller
{
    public function active(Request $request): JsonResponse|Response
    {
        Reservation::expirerPerimees();

        $reservation = Reservation::with(['borne', 'connecteur'])
            ->where('user_id', $request->user()->id)
            ->where('statut', 'active')
            ->first();

        return $reservation
            ? response()->json($this->format($reservation))
            : response('null', 200, ['Content-Type' => 'application/json']);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['connecteur_id' => ['required', 'exists:connecteurs,id']]);

        Reservation::expirerPerimees();

        $reservation = DB::transaction(function () use ($request, $data) {
            $connecteur = Connecteur::with('borne')->lockForUpdate()->findOrFail($data['connecteur_id']);
            $user = $request->user();

            if ($connecteur->borne->source === 'publique') {
                throw ValidationException::withMessages([
                    'connecteur_id' => ['Les bornes publiques d’autres opérateurs ne se réservent pas ici.'],
                ]);
            }
            if ($connecteur->etat !== 'disponible') {
                throw ValidationException::withMessages([
                    'connecteur_id' => ['Cette prise n’est plus libre.'],
                ]);
            }
            if (Reservation::where('user_id', $user->id)->where('statut', 'active')->exists()) {
                throw ValidationException::withMessages([
                    'connecteur_id' => ['Vous avez déjà une réservation en cours.'],
                ]);
            }
            if ($user->sessions()->whereIn('etat', ['en_cours', 'en_pause'])->exists()) {
                throw ValidationException::withMessages([
                    'connecteur_id' => ['Une recharge est déjà en cours.'],
                ]);
            }

            $connecteur->update(['etat' => 'reserve']);

            return Reservation::create([
                'user_id' => $user->id,
                'borne_id' => $connecteur->borne_id,
                'connecteur_id' => $connecteur->id,
                'expire_le' => now()->addMinutes(Reservation::DUREE_MINUTES),
            ]);
        });

        AuditLog::record($request->user()->id, 'reservation', 'connecteur:'.$reservation->connecteur_id);

        return response()->json($this->format($reservation->load(['borne', 'connecteur'])), 201);
    }

    public function destroy(Request $request, Reservation $reservation): JsonResponse
    {
        abort_unless($reservation->user_id === $request->user()->id, 403);
        abort_unless($reservation->statut === 'active', 409, 'Réservation déjà close.');

        DB::transaction(function () use ($reservation) {
            $reservation->update(['statut' => 'annulee']);
            if ($reservation->connecteur->etat === 'reserve') {
                $reservation->connecteur->update(['etat' => 'disponible']);
            }
        });

        return response()->json(['message' => 'Réservation annulée.']);
    }

    private function format(Reservation $r): array
    {
        return [
            'id' => $r->id,
            'borneId' => $r->borne_id,
            'borneNom' => $r->borne->nom,
            'connecteurId' => $r->connecteur_id,
            'typeConnecteur' => $r->connecteur->type,
            'puissanceKw' => $r->connecteur->puissance_kw,
            'expireLe' => $r->expire_le->toIso8601String(),
        ];
    }
}
