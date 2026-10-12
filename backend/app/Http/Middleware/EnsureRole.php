<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** RBAC : restreint une route aux rôles listés (ex: role:super_admin,exploitant). */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        abort_unless(
            $request->user() && in_array($request->user()->role, $roles, true),
            403,
            'Accès refusé pour ce rôle.'
        );

        return $next($request);
    }
}
