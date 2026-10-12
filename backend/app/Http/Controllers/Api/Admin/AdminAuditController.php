<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\Concerns;
use App\Models\AuditLog;
use App\Support\Exporteur;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Module 18 — journal d'audit : connexions, modifications, suppressions, exports. */
class AdminAuditController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $page = $this->requete($request)->paginate(min(200, (int) $request->query('par_page', 30)));

        return response()->json([
            'data' => collect($page->items())->map(fn (AuditLog $l) => $this->presenter($l)),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'per_page' => $page->perPage()],
            'actions' => AuditLog::query()->distinct()->orderBy('action')->pluck('action'),
        ]);
    }

    public function export(Request $request): Response
    {
        $format = $request->validate(['format' => ['required', 'in:'.implode(',', Exporteur::FORMATS)]])['format'];
        $lignes = $this->requete($request)->limit(10000)->get()->map(fn (AuditLog $l) => $this->presenter($l));

        AuditLog::record($request->user()->id, 'export', 'audit', strtoupper($format).' — '.$lignes->count().' ligne(s)');

        return Exporteur::reponse("Journal d'audit", [
            'date' => 'Date', 'userNom' => 'Utilisateur', 'action' => 'Action', 'cible' => 'Cible', 'details' => 'Détails', 'ip' => 'IP',
        ], $lignes->map(fn ($l) => [...$l, 'date' => date('d/m/Y H:i:s', strtotime($l['createdAt']))]), $format);
    }

    private function requete(Request $request)
    {
        return AuditLog::with('user')
            ->when($request->query('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            ->when($request->query('action'), fn ($q, $a) => $q->whereIn('action', explode(',', $a)))
            ->when($request->query('cible'), fn ($q, $c) => $q->where('cible', 'like', "{$c}%"))
            ->when($request->query('debut'), fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
            ->when($request->query('fin'), fn ($q, $d) => $q->whereDate('created_at', '<=', $d))
            ->when($request->query('q'), fn ($q, $t) => $q->where(fn ($w) => $w
                ->where('details', 'like', "%{$t}%")->orWhere('cible', 'like', "%{$t}%")->orWhere('ip', 'like', "%{$t}%")))
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    private function presenter(AuditLog $log): array
    {
        return [
            'id' => $log->id,
            'userId' => $log->user_id,
            'userNom' => Concerns::nomComplet($log->user) ?? 'Système',
            'action' => $log->action,
            'cible' => $log->cible,
            'details' => $log->details,
            'ip' => $log->ip,
            'createdAt' => $log->created_at->toIso8601String(),
        ];
    }
}
