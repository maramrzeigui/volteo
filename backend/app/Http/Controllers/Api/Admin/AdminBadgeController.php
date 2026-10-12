<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AdminBadgeResource;
use App\Http\Resources\Concerns;
use App\Models\BadgeRfid;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/** Module 7 — association, activation, blocage, expiration et historique des badges RFID. */
class AdminBadgeController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $badges = BadgeRfid::with('user')
            ->when($request->query('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            ->when($request->query('q'), fn ($q, $t) => $q->where(fn ($w) => $w
                ->where('uid', 'like', "%{$t}%")->orWhere('libelle', 'like', "%{$t}%")
                ->orWhereHas('user', fn ($u) => $u->where('nom', 'like', "%{$t}%")->orWhere('email', 'like', "%{$t}%"))))
            ->latest()
            ->get();

        if ($statut = $request->query('statut')) {
            $badges = $badges->filter(fn (BadgeRfid $b) => $b->statut() === $statut)->values();
        }

        return AdminBadgeResource::collection($badges);
    }

    public function store(Request $request): AdminBadgeResource
    {
        $data = $request->validate([
            'uid' => ['required', 'string', 'max:50', 'unique:badges_rfid,uid'],
            'libelle' => ['nullable', 'string', 'max:100'],
            'userId' => ['nullable', Rule::exists('users', 'id')],
            'dateExpiration' => ['nullable', 'date', 'after:today'],
        ]);

        $badge = BadgeRfid::create([
            'uid' => strtoupper($data['uid']),
            'libelle' => $data['libelle'] ?? null,
            'user_id' => $data['userId'] ?? null,
            'date_expiration' => $data['dateExpiration'] ?? null,
            'actif' => true,
        ]);
        $badge->journaliser('creation');
        if ($badge->user_id) {
            $badge->journaliser('association', Concerns::nomComplet($badge->user));
        }

        return new AdminBadgeResource($badge->load('user'));
    }

    public function update(Request $request, BadgeRfid $badge): AdminBadgeResource
    {
        $data = $request->validate([
            'libelle' => ['nullable', 'string', 'max:100'],
            'userId' => ['nullable', Rule::exists('users', 'id')],
            'dateExpiration' => ['nullable', 'date'],
            'actif' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('userId', $data) && $data['userId'] != $badge->user_id) {
            $ancien = Concerns::nomComplet($badge->user);
            $badge->user_id = $data['userId'];
            $badge->journaliser(
                $data['userId'] ? 'association' : 'dissociation',
                $data['userId'] ? Concerns::nomComplet(User::find($data['userId'])) : $ancien
            );
        }
        if (array_key_exists('dateExpiration', $data) && $data['dateExpiration'] !== $badge->date_expiration?->format('Y-m-d')) {
            $badge->date_expiration = $data['dateExpiration'];
            $badge->journaliser('expiration', $data['dateExpiration'] ? 'Expire le '.$data['dateExpiration'] : 'Sans expiration');
        }
        if (array_key_exists('actif', $data) && $data['actif'] !== $badge->actif) {
            $badge->actif = $data['actif'];
            $badge->journaliser($data['actif'] ? 'activation' : 'desactivation');
        }
        if (array_key_exists('libelle', $data)) {
            $badge->libelle = $data['libelle'];
        }
        $badge->save();

        return new AdminBadgeResource($badge->load('user'));
    }

    public function bloquer(Request $request, BadgeRfid $badge): AdminBadgeResource
    {
        $data = $request->validate(['motif' => ['required', 'string', 'max:255']]);
        $badge->update(['bloque' => true, 'motif_blocage' => $data['motif']]);
        $badge->journaliser('blocage', $data['motif']);

        return new AdminBadgeResource($badge->load('user'));
    }

    public function debloquer(BadgeRfid $badge): AdminBadgeResource
    {
        $badge->update(['bloque' => false, 'motif_blocage' => null]);
        $badge->journaliser('deblocage');

        return new AdminBadgeResource($badge->load('user'));
    }

    public function historique(BadgeRfid $badge): JsonResponse
    {
        return response()->json(
            $badge->evenements()->with(['acteur', 'borne'])->latest()->limit(200)->get()->map(fn ($e) => [
                'id' => $e->id,
                'evenement' => $e->evenement,
                'details' => $e->details,
                'acteur' => Concerns::nomComplet($e->acteur) ?? 'Système',
                'borneNom' => $e->borne?->nom,
                'date' => $e->created_at->toIso8601String(),
            ])
        );
    }
}
