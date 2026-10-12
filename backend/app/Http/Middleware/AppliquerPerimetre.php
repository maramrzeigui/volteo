<?php

namespace App\Http\Middleware;

use App\Support\Perimetre;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Back-office : le personnel rattaché à une station ne voit que sa station.
 * Une station suspendue perd l'accès au back-office (lecture du contrat comprise).
 */
class AppliquerPerimetre
{
    public function __construct(private readonly Perimetre $perimetre) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && $user->role !== 'super_admin' && $user->station_id) {
            $station = $user->station;
            if (! $station || $station->statut === 'suspendu') {
                return response()->json(['message' => 'L’accès de votre station est suspendu. Contactez Volteo.'], 403);
            }
            $this->perimetre->limiter($user->station_id);
        }

        try {
            return $next($request);
        } finally {
            // Les requêtes suivantes (tests, workers longue durée) repartent sans périmètre.
            $this->perimetre->limiter(null);
        }
    }
}
