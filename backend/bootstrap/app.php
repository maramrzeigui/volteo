<?php

use App\Http\Middleware\AppliquerPerimetre;
use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\VerifyOcppSecret;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => EnsureRole::class,
            'permission' => EnsurePermission::class,
            'ocpp.secret' => VerifyOcppSecret::class,
            'perimetre' => AppliquerPerimetre::class,
        ]);
        // Le périmètre doit s'appliquer AVANT la résolution des {borne}, {user}… des routes :
        // sinon une ressource d'une autre station resterait accessible par son identifiant.
        $middleware->prependToPriorityList(before: SubstituteBindings::class, prepend: AppliquerPerimetre::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Limitation de débit : message en français, avec le délai d'attente.
        $exceptions->render(function (ThrottleRequestsException $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }
            $secondes = (int) ($e->getHeaders()['Retry-After'] ?? 60);

            return response()->json([
                'message' => "Trop de tentatives. Réessayez dans {$secondes} secondes.",
            ], 429, $e->getHeaders());
        });
    })->create();
