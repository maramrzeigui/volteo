<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Borne;
use App\Models\MessageStation;
use App\Models\SessionRecharge;
use App\Models\Station;
use App\Models\User;
use App\Services\ActiviteStation;
use App\Services\Releves;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Console du super-admin : les stations clientes de la plateforme, leurs contrats,
 * leurs administrateurs, leurs bornes et les reversements mensuels.
 */
class AdminStationController extends Controller
{
    public function __construct(private readonly Releves $releves, private readonly ActiviteStation $activite) {}

    /** Vue d'ensemble de la plateforme et liste des stations avec leurs chiffres du mois. */
    public function index(): JsonResponse
    {
        $mois = now()->format('Y-m');
        $stations = Station::withCount(['bornes', 'personnel'])->orderBy('nom')->get()
            ->map(fn (Station $s) => [...$this->resume($s), 'mois' => $this->releves->mois($s, $mois)]);

        $ca = $stations->sum(fn ($s) => $s['mois']['chiffreAffaires']);

        return response()->json([
            'plateforme' => [
                'stations' => $stations->count(),
                'stationsActives' => $stations->where('statut', 'actif')->count(),
                'bornes' => Borne::where('source', 'reseau')->count(),
                'bornesSansStation' => Borne::where('source', 'reseau')->whereNull('station_id')->count(),
                'chiffreAffairesMois' => round($ca, 3),
                'commissionMois' => round($stations->sum(fn ($s) => $s['mois']['commission']), 3),
                'aReverser' => round($this->totalAReverser(), 3),
                'sessionsEnCours' => SessionRecharge::whereIn('etat', SessionRecharge::ETATS_ACTIFS)->count(),
            ],
            'stations' => $stations->values(),
        ]);
    }

    public function show(Request $request, Station $station): JsonResponse
    {
        $station->loadCount(['bornes', 'personnel']);
        $annee = (int) $request->query('annee', now()->year);

        return response()->json([
            ...$this->resume($station),
            'bornesListe' => $station->bornes()->orderBy('nom')->get(['id', 'nom', 'reference', 'etat', 'puissance_kw', 'dernier_heartbeat'])
                ->map(fn (Borne $b) => ['id' => $b->id, 'nom' => $b->nom, 'reference' => $b->reference, 'etat' => $b->etat, 'puissanceKw' => $b->puissance_kw, 'enLigne' => $b->estEnLigne()]),
            'personnelListe' => $station->personnel()->orderBy('nom')->get(['id', 'nom', 'prenom', 'email', 'role', 'actif', 'derniere_connexion'])
                ->map(fn (User $u) => ['id' => $u->id, 'nom' => trim("{$u->prenom} {$u->nom}"), 'email' => $u->email, 'role' => $u->role, 'actif' => $u->actif, 'derniereConnexion' => $u->derniere_connexion?->toIso8601String()]),
            'releves' => $this->releves->annee($station, $annee),
            'annee' => $annee,
            'bornesActivite' => $this->activite->bornes($station),
            'recharges' => $this->activite->enCours($station),
            'clients' => $this->activite->clients($station),
        ]);
    }

    /** Nouvelle station cliente, avec son compte administrateur (mot de passe affiché une seule fois). */
    public function store(Request $request): JsonResponse
    {
        $data = $this->valider($request, creation: true);
        $admin = $request->validate([
            'admin.prenom' => ['required', 'string', 'max:100'],
            'admin.nom' => ['required', 'string', 'max:100'],
            'admin.email' => ['required', 'email', 'unique:users,email'],
        ])['admin'];

        [$station, $motDePasse] = DB::transaction(function () use ($data, $admin) {
            $station = Station::create($this->colonnes($data));
            $motDePasse = Str::password(14, symbols: false);
            User::create([
                'name' => "{$admin['prenom']} {$admin['nom']}",
                'prenom' => $admin['prenom'],
                'nom' => $admin['nom'],
                'email' => $admin['email'],
                'password' => $motDePasse,
                'role' => 'exploitant',
                'station_id' => $station->id,
            ]);

            return [$station, $motDePasse];
        });
        AuditLog::record($request->user()->id, 'station_creee', 'station:'.$station->id, $station->nom);

        return response()->json([
            ...$this->resume($station->loadCount(['bornes', 'personnel'])),
            'acces' => ['email' => $admin['email'], 'motDePasse' => $motDePasse],
        ], 201);
    }

    public function update(Request $request, Station $station): JsonResponse
    {
        $station->update($this->colonnes($this->valider($request, creation: false)));
        AuditLog::record($request->user()->id, 'station_modifiee', 'station:'.$station->id, $station->nom);

        return response()->json($this->resume($station->loadCount(['bornes', 'personnel'])));
    }

    /** Suspend une station : ses bornes disparaissent de l'appli et son personnel perd l'accès. */
    public function suspendre(Request $request, Station $station): JsonResponse
    {
        $motif = $request->validate(['motif' => ['required', 'string', 'max:255']])['motif'];
        $station->update(['statut' => 'suspendu', 'motif_suspension' => $motif]);
        User::where('station_id', $station->id)->each(fn (User $u) => $u->tokens()->delete());
        AuditLog::record($request->user()->id, 'station_suspendue', 'station:'.$station->id, $motif);

        return response()->json($this->resume($station->loadCount(['bornes', 'personnel'])));
    }

    public function reactiver(Request $request, Station $station): JsonResponse
    {
        $station->update(['statut' => 'actif', 'motif_suspension' => null]);
        AuditLog::record($request->user()->id, 'station_reactivee', 'station:'.$station->id, $station->nom);

        return response()->json($this->resume($station->loadCount(['bornes', 'personnel'])));
    }

    /** Rattache des bornes à la station (elles quittent leur station précédente). */
    public function affecterBornes(Request $request, Station $station): JsonResponse
    {
        $ids = $request->validate(['borneIds' => ['required', 'array', 'min:1'], 'borneIds.*' => ['integer', 'exists:bornes,id']])['borneIds'];
        if ($station->bornes_max && $station->bornes()->whereNotIn('id', $ids)->count() + count($ids) > $station->bornes_max) {
            return response()->json(['message' => "La formule de cette station est limitée à {$station->bornes_max} bornes."], 422);
        }
        // Les bornes rattachées prennent l'admin de la station ; un technicien d'une autre station est retiré.
        $admin = $station->personnel()->where('role', 'exploitant')->where('actif', true)->orderBy('id')->value('id');
        Borne::whereIn('id', $ids)->update(['station_id' => $station->id, 'exploitant_id' => $admin]);
        Borne::whereIn('id', $ids)->whereNotIn('technicien_id', $station->personnel()->pluck('id'))->update(['technicien_id' => null]);
        AuditLog::record($request->user()->id, 'bornes_affectees', 'station:'.$station->id, count($ids).' borne(s)');

        return response()->json(['message' => count($ids).' borne(s) rattachée(s) à '.$station->nom.'.']);
    }

    /**
     * Nouveau mot de passe pour un membre du personnel d'une station (oubli, départ, test).
     * Affiché une seule fois au super-admin ; les sessions ouvertes sont déconnectées.
     */
    public function nouveauMotDePasse(Request $request, Station $station, User $user): JsonResponse
    {
        abort_unless($user->station_id === $station->id, 404);
        $motDePasse = Str::password(12, symbols: false);
        $user->forceFill(['password' => $motDePasse])->save();
        $user->tokens()->delete();
        AuditLog::record($request->user()->id, 'mot_de_passe_reinitialise', 'user:'.$user->id, "{$user->email} ({$station->nom})");

        return response()->json(['email' => $user->email, 'motDePasse' => $motDePasse]);
    }

    /** Enregistre le virement du net d'un mois clos à la station. */
    public function payer(Request $request, Station $station): JsonResponse
    {
        $data = $request->validate([
            'periode' => ['required', 'date_format:Y-m'],
            'reference' => ['nullable', 'string', 'max:60'],
        ]);
        $r = $this->releves->payer($station, $data['periode'], $request->user(), $data['reference'] ?? null);
        AuditLog::record($request->user()->id, 'reversement_paye', 'station:'.$station->id, "{$r->periode} : {$r->net} DT");

        return response()->json(['message' => 'Reversement de '.number_format((float) $r->net, 3, ',', ' ')." DT enregistré pour {$r->periode}."]);
    }

    private function totalAReverser(): float
    {
        $total = 0.0;
        foreach (Station::all() as $s) {
            foreach ($this->releves->annee($s, now()->year) as $l) {
                if ($l['statut'] === 'a_payer') {
                    $total += $l['net'];
                }
            }
        }

        return $total;
    }

    private function resume(Station $s): array
    {
        return [
            'id' => $s->id,
            'nom' => $s->nom,
            'raisonSociale' => $s->raison_sociale,
            'matriculeFiscal' => $s->matricule_fiscal,
            'email' => $s->email,
            'telephone' => $s->telephone,
            'adresse' => $s->adresse,
            'ville' => $s->ville,
            'commissionPct' => (float) $s->commission_pct,
            'formule' => $s->formule,
            'bornesMax' => $s->bornes_max,
            'statut' => $s->statut,
            'active' => $s->estActive(),
            'motifSuspension' => $s->motif_suspension,
            'debutContrat' => $s->debut_contrat?->toDateString(),
            'finContrat' => $s->fin_contrat?->toDateString(),
            'rib' => $s->rib,
            'couleur' => $s->couleur,
            'messagesNonLus' => MessageStation::where('station_id', $s->id)->where('de_plateforme', false)->whereNull('lu_at')->count(),
            'bornes' => $s->bornes_count ?? $s->bornes()->count(),
            'personnel' => $s->personnel_count ?? $s->personnel()->count(),
        ];
    }

    private function valider(Request $request, bool $creation): array
    {
        $r = $creation ? 'required' : 'sometimes';

        return $request->validate([
            'nom' => [$r, 'string', 'max:120'],
            'raisonSociale' => ['nullable', 'string', 'max:160'],
            'matriculeFiscal' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:160'],
            'telephone' => ['nullable', 'string', 'max:30'],
            'adresse' => ['nullable', 'string', 'max:255'],
            'ville' => ['nullable', 'string', 'max:80'],
            'commissionPct' => [$r, 'numeric', 'between:0,50'],
            'formule' => [$r, Rule::in(Station::FORMULES)],
            'bornesMax' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'debutContrat' => ['nullable', 'date'],
            'finContrat' => ['nullable', 'date', 'after_or_equal:debutContrat'],
            'rib' => ['nullable', 'string', 'max:40'],
            'couleur' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);
    }

    private function colonnes(array $d): array
    {
        $map = ['raisonSociale' => 'raison_sociale', 'matriculeFiscal' => 'matricule_fiscal', 'commissionPct' => 'commission_pct',
            'bornesMax' => 'bornes_max', 'debutContrat' => 'debut_contrat', 'finContrat' => 'fin_contrat'];
        $out = [];
        foreach ($d as $k => $v) {
            $out[$map[$k] ?? $k] = $v;
        }

        return $out;
    }
}
