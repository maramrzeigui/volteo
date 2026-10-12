<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Protège les routes internes appelées par le serveur OCPP. */
class VerifyOcppSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $attendu = config('services.ocpp.secret');

        // En production, le secret de développement publié dans le dépôt ne protège rien.
        abort_if(
            app()->isProduction() && $attendu === config('services.ocpp.secret_dev'),
            503,
            'OCPP_SHARED_SECRET doit être défini en production.'
        );

        abort_unless(
            $attendu && hash_equals($attendu, (string) $request->header('X-Ocpp-Secret')),
            401,
            'Secret OCPP invalide.'
        );

        return $next($request);
    }
}
