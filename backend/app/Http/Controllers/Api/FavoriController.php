<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Borne;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FavoriController extends Controller
{
    /** Identifiants des bornes favorites du client. */
    public function index(Request $request): JsonResponse
    {
        return response()->json(
            DB::table('favoris')->where('user_id', $request->user()->id)->pluck('borne_id')
        );
    }

    public function store(Request $request, Borne $borne): JsonResponse
    {
        DB::table('favoris')->insertOrIgnore([
            'user_id' => $request->user()->id,
            'borne_id' => $borne->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Ajoutée aux favoris.'], 201);
    }

    public function destroy(Request $request, Borne $borne): JsonResponse
    {
        DB::table('favoris')
            ->where('user_id', $request->user()->id)
            ->where('borne_id', $borne->id)
            ->delete();

        return response()->json(['message' => 'Retirée des favoris.']);
    }
}
