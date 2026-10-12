<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UtilisateurResource;
use App\Models\AuditLog;
use App\Models\Parametre;
use App\Models\User;
use App\Services\Auth\VerificateurGoogle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Essais autorisés pour un même code à 6 chiffres avant son invalidation. */
    private const ESSAIS_CODE = 5;

    /** Longueur minimale d'un mot de passe. */
    private const MOT_DE_PASSE_MIN = 8;

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $credentials['email'])->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            AuditLog::record($user?->id, 'connexion_echouee', $user ? 'user:'.$user->id : null, $credentials['email']);
            throw ValidationException::withMessages([
                'email' => ['Email ou mot de passe invalide.'],
            ]);
        }

        if (! $user->actif) {
            throw ValidationException::withMessages([
                'email' => ['Ce compte est désactivé. Contactez le support.'],
            ]);
        }

        // Double authentification : un code à 6 chiffres est envoyé par email,
        // le token n'est délivré qu'après vérification via /auth/2fa/verify.
        // Elle peut être rendue obligatoire pour tout le personnel (paramétrage).
        $deuxFacteurs = $user->two_factor_enabled
            || ($user->estPersonnel() && Parametre::get('deux_facteurs_personnel'));

        if ($deuxFacteurs) {
            $code = (string) random_int(100000, 999999);
            RateLimiter::clear($this->cleEssais($user, '2fa'));
            $user->forceFill([
                'two_factor_code' => Hash::make($code),
                'two_factor_expires_at' => now()->addMinutes(10),
            ])->save();

            $this->envoyerCode($user, 'Votre code de connexion '.Parametre::get('plateforme_nom'), $code);

            return response()->json(['twoFactor' => true]);
        }

        return $this->connecter($user, 'connexion');
    }

    public function verify2fa(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'code' => ['required', 'string'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! $user->two_factor_code
            || $user->two_factor_expires_at?->isPast()
            || ! $this->codeValide($user, '2fa', $data['code'], $user->two_factor_code)) {
            throw ValidationException::withMessages(['code' => ['Code invalide ou expiré.']]);
        }

        $user->forceFill(['two_factor_code' => null, 'two_factor_expires_at' => null])->save();

        if (! $user->actif) {
            throw ValidationException::withMessages(['code' => ['Ce compte est désactivé. Contactez le support.']]);
        }

        return $this->connecter($user, 'connexion_2fa');
    }

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'nom' => ['required', 'string', 'max:100'],
            'prenom' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'unique:users,email'],
            'telephone' => ['nullable', 'string', 'max:30'],
            'password' => ['required', 'string', 'min:'.self::MOT_DE_PASSE_MIN],
        ]);

        $user = User::create([
            'name' => $data['prenom'].' '.$data['nom'],
            'nom' => $data['nom'],
            'prenom' => $data['prenom'],
            'email' => $data['email'],
            'telephone' => $data['telephone'] ?? null,
            'password' => $data['password'],
            'role' => 'client',
        ]);

        AuditLog::record($user->id, 'inscription', 'user:'.$user->id);

        return response()->json([
            'token' => $user->createToken('mobile')->plainTextToken,
            'user' => new UtilisateurResource($user),
        ], 201);
    }

    /**
     * « Continuer avec Google » (clients uniquement) : crée le compte au premier passage,
     * relie un compte existant de même email vérifié et met à jour la photo de profil.
     */
    public function google(Request $request, VerificateurGoogle $google): JsonResponse
    {
        $data = $request->validate(['id_token' => ['required', 'string', 'max:4096']]);
        $profil = $google->verifier($data['id_token']);

        $user = User::where('google_id', $profil['sub'])->first()
            ?? User::where('email', $profil['email'])->first();

        if ($user?->estPersonnel()) {
            // Le personnel garde sa connexion par mot de passe et double authentification.
            throw ValidationException::withMessages(['google' => ['Utilisez votre mot de passe pour vous connecter à ce compte.']]);
        }
        if ($user && $user->google_id && $user->google_id !== $profil['sub']) {
            throw ValidationException::withMessages(['google' => ['Ce compte est déjà relié à un autre compte Google.']]);
        }

        $cree = ! $user;
        $user ??= User::create([
            'name' => trim($profil['prenom'].' '.$profil['nom']),
            'prenom' => $profil['prenom'],
            'nom' => $profil['nom'],
            'email' => $profil['email'],
            // Mot de passe aléatoire : le client pourra en définir un via « mot de passe oublié ».
            'password' => Str::password(32),
            'role' => 'client',
        ]);

        if (! $user->actif) {
            throw ValidationException::withMessages(['google' => ['Ce compte est désactivé. Contactez le support.']]);
        }

        $user->forceFill([
            'google_id' => $profil['sub'],
            'photo_url' => $profil['photo'] ?? $user->photo_url,
            'email_verified_at' => $user->email_verified_at ?? now(),
        ])->save();

        $reponse = $this->connecter($user, $cree ? 'inscription_google' : 'connexion_google');

        return $cree ? $reponse->setStatusCode(201) : $reponse;
    }

    /** Envoie un code de réinitialisation à 6 chiffres (valable 15 min). */
    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);

        $user = User::where('email', $data['email'])->first();

        if ($user) {
            $code = (string) random_int(100000, 999999);
            RateLimiter::clear($this->cleEssais($user, 'reset'));
            $user->forceFill([
                'reset_code' => Hash::make($code),
                'reset_code_expires_at' => now()->addMinutes(15),
            ])->save();

            $this->envoyerCode($user, 'Réinitialisation de votre mot de passe '.Parametre::get('plateforme_nom'), $code);
        }

        // Réponse identique que l'email existe ou non (pas d'énumération de comptes).
        return response()->json(['message' => 'Si ce compte existe, un code a été envoyé par email.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'code' => ['required', 'string'],
            'password' => ['required', 'string', 'min:'.self::MOT_DE_PASSE_MIN],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! $user->reset_code
            || $user->reset_code_expires_at?->isPast()
            || ! $this->codeValide($user, 'reset', $data['code'], $user->reset_code)) {
            throw ValidationException::withMessages(['code' => ['Code invalide ou expiré.']]);
        }

        $user->forceFill([
            'password' => $data['password'],
            'reset_code' => null,
            'reset_code_expires_at' => null,
        ])->save();

        $user->tokens()->delete();
        AuditLog::record($user->id, 'reinitialisation_mot_de_passe', 'user:'.$user->id);

        return response()->json(['message' => 'Mot de passe réinitialisé, vous pouvez vous connecter.']);
    }

    public function logout(Request $request): JsonResponse
    {
        AuditLog::record($request->user()->id, 'deconnexion', 'user:'.$request->user()->id);
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Déconnecté']);
    }

    public function me(Request $request): UtilisateurResource
    {
        return new UtilisateurResource($request->user());
    }

    /** Mise à jour du profil par l'utilisateur lui-même. */
    public function profil(Request $request): UtilisateurResource
    {
        $user = $request->user();
        $data = $request->validate([
            'nom' => ['sometimes', 'string', 'max:100'],
            'prenom' => ['sometimes', 'string', 'max:100'],
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'telephone' => ['nullable', 'string', 'max:30'],
            'motDePasseActuel' => ['required_with:nouveauMotDePasse', 'string'],
            'nouveauMotDePasse' => ['sometimes', 'string', 'min:'.self::MOT_DE_PASSE_MIN],
        ]);

        if (isset($data['nouveauMotDePasse'])) {
            if (! Hash::check($data['motDePasseActuel'], $user->password)) {
                throw ValidationException::withMessages(['motDePasseActuel' => ['Mot de passe actuel incorrect.']]);
            }
            $user->password = $data['nouveauMotDePasse'];
        }

        $user->fill(collect($data)->only(['nom', 'prenom', 'email', 'telephone'])->all());
        $user->name = trim($user->prenom.' '.$user->nom);
        $user->save();

        return new UtilisateurResource($user);
    }

    /** Active / désactive la double authentification par email. */
    public function deuxFacteurs(Request $request): UtilisateurResource
    {
        $data = $request->validate(['actif' => ['required', 'boolean']]);
        $request->user()->forceFill(['two_factor_enabled' => $data['actif']])->save();
        AuditLog::record($request->user()->id, $data['actif'] ? '2fa_activee' : '2fa_desactivee', 'user:'.$request->user()->id);

        return new UtilisateurResource($request->user());
    }

    private function connecter(User $user, string $action): JsonResponse
    {
        $user->forceFill(['derniere_connexion' => now()])->save();
        AuditLog::record($user->id, $action, 'user:'.$user->id);

        return response()->json([
            'token' => $user->createToken($user->estPersonnel() ? 'web' : 'mobile')->plainTextToken,
            'user' => new UtilisateurResource($user),
        ]);
    }

    /**
     * Vérifie un code à usage unique. Au-delà de ESSAIS_CODE erreurs le code est
     * invalidé : deviner 6 chiffres devient impossible, même depuis plusieurs IP.
     */
    private function codeValide(User $user, string $type, string $code, string $hash): bool
    {
        $cle = $this->cleEssais($user, $type);

        if (Hash::check($code, $hash)) {
            RateLimiter::clear($cle);

            return true;
        }

        RateLimiter::hit($cle, 900);
        if (RateLimiter::attempts($cle) >= self::ESSAIS_CODE) {
            $user->forceFill($type === '2fa'
                ? ['two_factor_code' => null, 'two_factor_expires_at' => null]
                : ['reset_code' => null, 'reset_code_expires_at' => null])->save();
            RateLimiter::clear($cle);
            AuditLog::record($user->id, 'code_invalide_trop_d_essais', 'user:'.$user->id, $type);
        }

        return false;
    }

    private function cleEssais(User $user, string $type): string
    {
        return "code:{$type}:{$user->id}";
    }

    /** En dev (MAIL_MAILER=log) le code apparaît dans storage/logs/laravel.log. */
    private function envoyerCode(User $user, string $sujet, string $code): void
    {
        Mail::raw("Votre code : {$code}\nIl expire dans quelques minutes.", function ($mail) use ($user, $sujet) {
            $mail->to($user->email)->subject($sujet);
        });
    }
}
