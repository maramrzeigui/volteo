<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\MessageStation;
use App\Models\Station;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Messagerie plateforme ↔ station. La station écrit à Volteo (questions, demandes de bornes,
 * de formule…) ; le super-admin répond station par station ou publie une annonce à toutes.
 */
class MessagerieStationController extends Controller
{
    // --- Côté station ---

    public function fil(Request $request): JsonResponse
    {
        $station = $this->maStation($request);
        MessageStation::where('station_id', $station->id)->where('de_plateforme', true)->whereNull('lu_at')->update(['lu_at' => now()]);

        return response()->json($this->messages($station));
    }

    public function ecrire(Request $request): JsonResponse
    {
        $station = $this->maStation($request);
        $data = $request->validate([
            'contenu' => ['required', 'string', 'max:3000'],
            'categorie' => ['nullable', Rule::in(['message', 'demande'])],
        ]);
        $m = MessageStation::create([...$data, 'categorie' => $data['categorie'] ?? 'message', 'station_id' => $station->id, 'auteur_id' => $request->user()->id, 'de_plateforme' => false]);

        return response()->json($m->load('auteur')->enTableau(), 201);
    }

    // --- Côté super-admin ---

    public function filStation(Station $station): JsonResponse
    {
        MessageStation::where('station_id', $station->id)->where('de_plateforme', false)->whereNull('lu_at')->update(['lu_at' => now()]);

        return response()->json($this->messages($station));
    }

    public function repondre(Request $request, Station $station): JsonResponse
    {
        $data = $request->validate(['contenu' => ['required', 'string', 'max:3000']]);
        $m = MessageStation::create(['contenu' => $data['contenu'], 'categorie' => 'message', 'station_id' => $station->id, 'auteur_id' => $request->user()->id, 'de_plateforme' => true]);

        return response()->json($m->load('auteur')->enTableau(), 201);
    }

    /** Annonce envoyée à toutes les stations actives (maintenance, nouveau tarif, nouveauté…). */
    public function annonce(Request $request): JsonResponse
    {
        $data = $request->validate(['contenu' => ['required', 'string', 'max:3000']]);
        $stations = Station::where('statut', 'actif')->pluck('id');
        foreach ($stations as $id) {
            MessageStation::create(['contenu' => $data['contenu'], 'categorie' => 'annonce', 'station_id' => $id, 'auteur_id' => $request->user()->id, 'de_plateforme' => true]);
        }

        return response()->json(['message' => "Annonce envoyée à {$stations->count()} station(s).", 'stations' => $stations->count()], 201);
    }

    private function messages(Station $station): array
    {
        return MessageStation::where('station_id', $station->id)->with('auteur:id,prenom,nom')
            ->orderBy('created_at')->orderBy('id')->limit(300)->get()
            ->map->enTableau()->values()->all();
    }

    private function maStation(Request $request): Station
    {
        $station = $request->user()->station;
        abort_unless($station, 404, 'Votre compte n’est rattaché à aucune station.');

        return $station;
    }
}
