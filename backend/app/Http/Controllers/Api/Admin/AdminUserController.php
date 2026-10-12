<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AdminBadgeResource;
use App\Http\Resources\AdminSessionResource;
use App\Http\Resources\AdminUserResource;
use App\Http\Resources\AdminVehiculeResource;
use App\Http\Resources\Concerns;
use App\Http\Resources\PaiementResource;
use App\Http\Resources\SouscriptionResource;
use App\Models\Abonnement;
use App\Models\AuditLog;
use App\Models\Paiement;
use App\Models\Souscription;
use App\Models\User;
use App\Services\Abonnements;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Module 6 — clients, techniciens, exploitants, administrateurs. */
class AdminUserController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $users = User::withCount(['sessions', 'vehicules', 'badges'])
            ->when($request->query('role'), fn ($q, $r) => $q->whereIn('role', explode(',', $r)))
            ->when($request->query('type') === 'personnel', fn ($q) => $q->whereIn('role', User::ROLES_PERSONNEL))
            ->when($request->query('type') === 'clients', fn ($q) => $q->where('role', 'client'))
            ->when($request->has('actif'), fn ($q) => $q->where('actif', $request->boolean('actif')))
            ->when($request->query('q'), fn ($q, $t) => $q->where(fn ($w) => $w
                ->where('nom', 'like', "%{$t}%")->orWhere('prenom', 'like', "%{$t}%")
                ->orWhere('email', 'like', "%{$t}%")->orWhere('telephone', 'like', "%{$t}%")))
            ->orderBy('nom')
            ->get();

        return AdminUserResource::collection($users);
    }

    /** Liste légère pour les sélecteurs (techniciens, exploitants, clients). */
    public function options(Request $request): JsonResponse
    {
        return response()->json(
            User::where('actif', true)
                ->when($request->query('role'), fn ($q, $r) => $q->whereIn('role', explode(',', $r)))
                ->orderBy('nom')
                ->limit(500)
                ->get()
                ->map(fn (User $u) => ['id' => $u->id, 'nom' => Concerns::nomComplet($u), 'email' => $u->email, 'role' => $u->role])
        );
    }

    /** Fiche utilisateur : véhicules, badges, abonnement, sessions, paiements, KPIs. */
    public function show(User $user): JsonResponse
    {
        $user->loadCount(['sessions', 'vehicules', 'badges']);
        $terminees = $user->sessions()->where('etat', 'terminee');

        return response()->json([
            'user' => (new AdminUserResource($user))->resolve(),
            'stats' => [
                'sessions' => (clone $terminees)->count(),
                'kwh' => round((float) (clone $terminees)->sum('energie_kwh'), 2),
                'depenses' => round((float) (clone $terminees)->sum('prix'), 2),
                'impayes' => round((float) $user->paiements()->where('statut', 'en_attente')->sum('montant'), 2),
            ],
            'souscription' => ($s = $user->souscriptionActive()) ? (new SouscriptionResource($s))->resolve() : null,
            'souscriptions' => SouscriptionResource::collection($user->souscriptions()->with('abonnement')->latest()->get())->resolve(),
            'vehicules' => AdminVehiculeResource::collection($user->vehicules()->with('user')->get())->resolve(),
            'badges' => AdminBadgeResource::collection($user->badges()->with('user')->get())->resolve(),
            'sessions' => AdminSessionResource::collection(
                $user->sessions()->with(['borne', 'connecteur', 'user', 'vehicule', 'tarif', 'badge'])->latest('date_debut')->limit(20)->get()
            )->resolve(),
            'paiements' => PaiementResource::collection($user->paiements()->latest()->limit(20)->get())->resolve(),
        ]);
    }

    /** Historique des actions de / sur l'utilisateur (journal d'audit). */
    public function historique(User $user): JsonResponse
    {
        return response()->json(
            AuditLog::with('user')
                ->where(fn ($q) => $q->where('user_id', $user->id)->orWhere('cible', 'user:'.$user->id))
                ->latest()
                ->limit(100)
                ->get()
                ->map(fn (AuditLog $l) => [
                    'id' => $l->id,
                    'auteur' => Concerns::nomComplet($l->user) ?? 'Système',
                    'action' => $l->action,
                    'cible' => $l->cible,
                    'details' => $l->details,
                    'ip' => $l->ip,
                    'date' => $l->created_at->toIso8601String(),
                ])
        );
    }

    public function store(Request $request): AdminUserResource
    {
        $data = $this->valider($request);
        $this->verifierAttributionRole($request, $data['role']);

        $user = User::create([
            // Personnel d'une station : rattaché d'office à sa station ; le super-admin choisit.
            'station_id' => $this->stationAttribuee($request, $data),
            'name' => trim($data['prenom'].' '.$data['nom']),
            'nom' => $data['nom'],
            'prenom' => $data['prenom'],
            'email' => $data['email'],
            'telephone' => $data['telephone'] ?? null,
            'role' => $data['role'],
            'actif' => $data['actif'] ?? true,
            'password' => $data['password'] ?? Str::password(16),
        ]);

        return new AdminUserResource($user);
    }

    public function update(Request $request, User $user): AdminUserResource
    {
        $data = $this->valider($request, $user);

        if (isset($data['role']) && $data['role'] !== $user->role) {
            $this->verifierAttributionRole($request, $data['role'], $user);
        }
        if (array_key_exists('actif', $data) && ! $data['actif'] && $user->id === $request->user()->id) {
            throw ValidationException::withMessages(['actif' => ['Vous ne pouvez pas désactiver votre propre compte.']]);
        }

        $user->fill(collect($data)->only(['nom', 'prenom', 'email', 'telephone', 'role', 'actif'])->all());
        if ($request->user()->estPlateforme() && array_key_exists('stationId', $data)) {
            $user->station_id = in_array($user->role, ['client', 'super_admin'], true) ? null : $data['stationId'];
        }
        if (! empty($data['password'])) {
            $user->password = $data['password'];
        }
        $user->name = trim($user->prenom.' '.$user->nom);
        $user->save();

        // Un compte désactivé perd immédiatement ses sessions d'API.
        if ($user->wasChanged('actif') && ! $user->actif) {
            $user->tokens()->delete();
        }

        return new AdminUserResource($user->loadCount(['sessions', 'vehicules', 'badges']));
    }

    public function regenererQr(Request $request, User $user): AdminUserResource
    {
        $user->forceFill(['qr_token' => Str::random(40)])->save();
        AuditLog::record($request->user()->id, 'qr_regenere', 'user:'.$user->id);

        return new AdminUserResource($user);
    }

    /** Attribution manuelle d'un abonnement (offert ou payé par le wallet). */
    public function souscrire(Request $request, User $user, Abonnements $abonnements): SouscriptionResource
    {
        $data = $request->validate([
            'abonnementId' => ['required', 'exists:abonnements,id'],
            'offert' => ['boolean'],
        ]);

        $souscription = $abonnements->souscrire($user, Abonnement::findOrFail($data['abonnementId']), 'wallet', $data['offert'] ?? false);
        AuditLog::record($request->user()->id, 'abonnement_attribue', 'user:'.$user->id, $souscription->abonnement->nom ?? '');

        return new SouscriptionResource($souscription->load('abonnement'));
    }

    public function resilier(Request $request, Souscription $souscription): JsonResponse
    {
        $souscription->update(['statut' => 'resiliee', 'renouvellement_auto' => false, 'date_fin' => today()]);

        return response()->json(['message' => 'Abonnement résilié.']);
    }

    /** Ajustement du wallet (geste commercial, correction) — tracé comme paiement. */
    public function ajusterWallet(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'montant' => ['required', 'numeric', 'not_in:0', 'between:-1000,1000'],
            'motif' => ['required', 'string', 'max:255'],
        ]);

        $solde = DB::transaction(function () use ($user, $data) {
            $user = User::lockForUpdate()->findOrFail($user->id);
            if ($data['montant'] < 0 && (float) $user->solde_wallet + $data['montant'] < 0) {
                throw ValidationException::withMessages(['montant' => ['Le solde ne peut pas devenir négatif.']]);
            }
            $user->increment('solde_wallet', $data['montant']);
            Paiement::create([
                'user_id' => $user->id,
                'montant' => $data['montant'],
                'methode' => 'ajustement',
                'statut' => 'paye',
                'regle_le' => now(),
                'reference_psp' => mb_substr($data['motif'], 0, 190),
            ]);

            return (float) $user->fresh()->solde_wallet;
        });

        AuditLog::record($request->user()->id, 'ajustement_wallet', 'user:'.$user->id, "{$data['montant']} — {$data['motif']}");

        return response()->json(['soldeWallet' => $solde]);
    }

    private function verifierAttributionRole(Request $request, string $role, ?User $cible = null): void
    {
        // Seul un super administrateur crée ou modifie un super administrateur.
        if (($role === 'super_admin' || $cible?->role === 'super_admin') && $request->user()->role !== 'super_admin') {
            throw ValidationException::withMessages(['role' => ['Seul un super administrateur peut attribuer ce rôle.']]);
        }
        // Le personnel d'une station ne crée que du personnel de station (pas de compte plateforme).
        if (! $request->user()->estPlateforme() && $role === 'client') {
            throw ValidationException::withMessages(['role' => ['Les comptes clients se créent depuis l’application.']]);
        }
        if ($cible && $cible->id === $request->user()->id && $role !== $cible->role) {
            throw ValidationException::withMessages(['role' => ['Vous ne pouvez pas modifier votre propre rôle.']]);
        }
    }

    private function valider(Request $request, ?User $user = null): array
    {
        $requis = $user ? 'sometimes' : 'required';

        return $request->validate([
            'nom' => [$requis, 'string', 'max:100'],
            'prenom' => [$requis, 'string', 'max:100'],
            'email' => [$requis, 'email', Rule::unique('users', 'email')->ignore($user?->id)],
            'telephone' => ['nullable', 'string', 'max:30'],
            'role' => [$requis, Rule::in(User::ROLES)],
            'actif' => ['sometimes', 'boolean'],
            'password' => ['nullable', 'string', 'min:8'],
            'stationId' => ['nullable', 'exists:stations,id'],
        ]);
    }

    /** Station d'un nouveau compte : celle de l'auteur pour le personnel de station. */
    private function stationAttribuee(Request $request, array $data): ?int
    {
        if ($data['role'] === 'client' || $data['role'] === 'super_admin') {
            return null;
        }

        return $request->user()->estPlateforme() ? ($data['stationId'] ?? null) : $request->user()->station_id;
    }
}
