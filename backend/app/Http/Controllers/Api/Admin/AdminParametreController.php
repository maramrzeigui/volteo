<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Parametre;
use App\Models\User;
use App\Support\Perimetre;
use App\Support\Permissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/** Module 17 — paramètres système, TVA, logo, emails, SMS, fuseau horaire, langue ; §7 permissions. */
class AdminParametreController extends Controller
{
    public function index(): JsonResponse
    {
        $parametres = Parametre::tous();
        foreach (config('plateforme.parametres_secrets') as $secret) {
            $parametres[$secret] = $parametres[$secret] ? '••••••••' : null;
        }
        $parametres['logoUrl'] = self::urlLogo();

        return response()->json($parametres);
    }

    public function update(Request $request): JsonResponse
    {
        abort_if(app(Perimetre::class)->actif(), 403, 'Réservé à la plateforme Volteo.');
        $data = $request->validate([
            'plateforme_nom' => ['sometimes', 'string', 'max:100'],
            'devise' => ['sometimes', 'string', 'max:10'],
            'tva_taux' => ['sometimes', 'numeric', 'between:0,100'],
            'solde_minimum_recharge' => ['sometimes', 'numeric', 'between:0,500'],
            'fuseau_horaire' => ['sometimes', 'timezone:all'],
            'langue' => ['sometimes', Rule::in(['fr', 'en', 'ar'])],
            'mentions_facture' => ['sometimes', 'nullable', 'string', 'max:500'],
            'email_expediteur' => ['sometimes', 'email'],
            'email_alertes_destinataires' => ['sometimes', 'array'],
            'email_alertes_destinataires.*' => ['email'],
            'sms_actif' => ['sometimes', 'boolean'],
            'sms_fournisseur' => ['sometimes', 'string', 'max:50'],
            'sms_expediteur' => ['sometimes', 'string', 'max:11'],
            'sms_api_key' => ['sometimes', 'nullable', 'string', 'max:255'],
            'sms_destinataires' => ['sometimes', 'array'],
            'sms_destinataires.*' => ['string', 'max:20'],
            'push_actif' => ['sometimes', 'boolean'],
            'notifications_regles' => ['sometimes', 'array'],
            'notifications_regles.*' => ['array'],
            'notifications_regles.*.*' => [Rule::in(['email', 'sms', 'push'])],
            'seuil_temperature' => ['sometimes', 'numeric', 'between:30,120'],
            'delai_heartbeat_minutes' => ['sometimes', 'integer', 'between:1,60'],
            'deux_facteurs_personnel' => ['sometimes', 'boolean'],
        ]);

        // Le secret masqué renvoyé par index() n'écrase pas la valeur réelle.
        if (($data['sms_api_key'] ?? null) === '••••••••') {
            unset($data['sms_api_key']);
        }

        Parametre::enregistrer($data);
        AuditLog::record($request->user()->id, 'modification', 'parametres', implode(', ', array_keys($data)));

        return $this->index();
    }

    public function logo(Request $request): JsonResponse
    {
        abort_if(app(Perimetre::class)->actif(), 403, 'Réservé à la plateforme Volteo.');
        $request->validate(['logo' => ['required', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048']]);

        $ancien = Parametre::get('logo');
        $chemin = $request->file('logo')->store('logos', 'public');
        Parametre::enregistrer(['logo' => $chemin]);
        if ($ancien) {
            Storage::disk('public')->delete($ancien);
        }

        return response()->json(['logoUrl' => self::urlLogo()]);
    }

    /** Matrice des permissions (§7). */
    public function permissions(): JsonResponse
    {
        return response()->json([
            'modules' => config('plateforme.modules'),
            'roles' => array_keys(config('plateforme.permissions')),
            'matrice' => Permissions::matrice(),
        ]);
    }

    public function updatePermissions(Request $request): JsonResponse
    {
        abort_if(app(Perimetre::class)->actif(), 403, 'Réservé à la plateforme Volteo.');
        abort_unless($request->user()->role === 'super_admin', 403, 'Seul le super administrateur modifie la matrice des droits.');

        $data = $request->validate([
            'matrice' => ['required', 'array'],
            'matrice.*' => ['array'],
            'matrice.*.*' => [Rule::in(Permissions::NIVEAUX)],
        ]);

        $roles = array_keys(config('plateforme.permissions'));
        $modules = array_keys(config('plateforme.modules'));
        $matrice = collect($data['matrice'])
            ->only($roles)
            ->map(fn ($m) => collect($m)->only($modules)->all())
            ->all();

        Permissions::enregistrer($matrice);
        AuditLog::record($request->user()->id, 'modification', 'permissions', json_encode($matrice));

        return $this->permissions();
    }

    /** Informations publiques (page de connexion, en-tête). */
    public function public(): JsonResponse
    {
        return response()->json([
            'nom' => Parametre::get('plateforme_nom'),
            'logoUrl' => self::urlLogo(),
            'devise' => Parametre::get('devise'),
            'langue' => Parametre::get('langue'),
            'fuseauHoraire' => Parametre::get('fuseau_horaire'),
            'soldeMinimumRecharge' => User::soldeMinimumRecharge(),
            'googleClientId' => config('services.google.web_client_id') ?: null,
        ]);
    }

    private static function urlLogo(): ?string
    {
        $logo = Parametre::get('logo');

        return $logo ? '/storage/'.$logo : null;
    }
}
