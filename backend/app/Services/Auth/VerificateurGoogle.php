<?php

namespace App\Services\Auth;

use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

/**
 * Vérifie un ID token Google (OpenID Connect) auprès de Google : signature, expiration,
 * émetteur et audience (uniquement les identifiants client OAuth de Volteo).
 */
class VerificateurGoogle
{
    private const EMETTEURS = ['accounts.google.com', 'https://accounts.google.com'];

    /**
     * @return array{sub: string, email: string, prenom: string, nom: string, photo: ?string}
     */
    public function verifier(string $idToken): array
    {
        $audiences = array_filter(config('services.google.client_ids', []));
        if ($audiences === []) {
            throw ValidationException::withMessages(['google' => ['La connexion Google n’est pas configurée sur ce serveur.']]);
        }

        $reponse = Http::timeout(8)->get('https://oauth2.googleapis.com/tokeninfo', ['id_token' => $idToken]);
        $c = $reponse->json() ?? [];

        $valide = $reponse->successful()
            && in_array($c['aud'] ?? null, $audiences, true)
            && in_array($c['iss'] ?? null, self::EMETTEURS, true)
            && (int) ($c['exp'] ?? 0) > time()
            && filter_var($c['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN)
            && ! empty($c['sub']) && ! empty($c['email']);

        if (! $valide) {
            throw ValidationException::withMessages(['google' => ['Connexion Google refusée. Réessayez.']]);
        }

        $photo = $c['picture'] ?? null;

        return [
            'sub' => (string) $c['sub'],
            'email' => mb_strtolower($c['email']),
            'prenom' => $c['given_name'] ?? ($c['name'] ?? 'Client'),
            'nom' => $c['family_name'] ?? '',
            // Seules les photos servies en HTTPS par Google sont acceptées.
            'photo' => is_string($photo) && str_starts_with($photo, 'https://') ? $photo : null,
        ];
    }
}
