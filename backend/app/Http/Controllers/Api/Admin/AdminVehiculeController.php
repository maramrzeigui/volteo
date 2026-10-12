<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AdminSessionResource;
use App\Http\Resources\AdminVehiculeResource;
use App\Models\Connecteur;
use App\Models\Vehicule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/** Module 8 — véhicules et historique de leurs recharges. */
class AdminVehiculeController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $vehicules = Vehicule::with('user')
            ->withCount('sessions')
            ->withSum(['sessions as energie_totale' => fn ($q) => $q->where('etat', 'terminee')], 'energie_kwh')
            ->when($request->query('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            ->when($request->query('q'), fn ($q, $t) => $q->where(fn ($w) => $w
                ->where('immatriculation', 'like', "%{$t}%")->orWhere('marque', 'like', "%{$t}%")
                ->orWhere('modele', 'like', "%{$t}%")
                ->orWhereHas('user', fn ($u) => $u->where('nom', 'like', "%{$t}%")->orWhere('prenom', 'like', "%{$t}%"))))
            ->orderBy('marque')
            ->get();

        return AdminVehiculeResource::collection($vehicules);
    }

    public function store(Request $request): AdminVehiculeResource
    {
        return new AdminVehiculeResource(Vehicule::create($this->valider($request))->load('user'));
    }

    public function update(Request $request, Vehicule $vehicule): AdminVehiculeResource
    {
        $vehicule->update($this->valider($request, partiel: true));

        return new AdminVehiculeResource($vehicule->load('user'));
    }

    public function destroy(Vehicule $vehicule): JsonResponse
    {
        $vehicule->delete();

        return response()->json(['message' => 'Véhicule supprimé.']);
    }

    public function sessions(Vehicule $vehicule): AnonymousResourceCollection
    {
        return AdminSessionResource::collection(
            $vehicule->sessions()->with(['borne', 'connecteur', 'user', 'vehicule', 'tarif', 'badge'])->latest('date_debut')->limit(100)->get()
        );
    }

    private function valider(Request $request, bool $partiel = false): array
    {
        $r = $partiel ? 'sometimes' : 'required';
        $data = $request->validate([
            'userId' => [$r, 'exists:users,id'],
            'marque' => [$r, 'string', 'max:60'],
            'modele' => [$r, 'string', 'max:60'],
            'immatriculation' => [$r, 'string', 'max:20'],
            'typeConnecteur' => [$r, Rule::in(Connecteur::TYPES)],
            'capaciteBatterieKwh' => [$r, 'integer', 'min:1', 'max:300'],
        ]);

        return collect([
            'user_id' => $data['userId'] ?? null,
            'marque' => $data['marque'] ?? null,
            'modele' => $data['modele'] ?? null,
            'immatriculation' => isset($data['immatriculation']) ? strtoupper($data['immatriculation']) : null,
            'type_connecteur' => $data['typeConnecteur'] ?? null,
            'capacite_batterie_kwh' => $data['capaciteBatterieKwh'] ?? null,
        ])->filter(fn ($v) => $v !== null)->all();
    }
}
