<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * RBAC par module (§7) : `permission:bornes` exige la lecture pour les requêtes
 * GET et l'écriture pour les autres ; `permission:bornes,ecriture` force le niveau.
 */
class EnsurePermission
{
    public function handle(Request $request, Closure $next, string $module, ?string $niveau = null): Response
    {
        $niveau ??= $request->isMethodSafe() ? 'lecture' : 'ecriture';
        $user = $request->user();

        abort_unless(
            $user && $user->actif && $user->estPersonnel() && $user->peut($module, $niveau),
            403,
            $niveau === 'ecriture'
                ? 'Votre rôle ne permet pas de modifier ce module.'
                : 'Votre rôle ne donne pas accès à ce module.'
        );

        return $next($request);
    }
}
