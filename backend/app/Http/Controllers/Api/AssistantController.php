<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConversationAssistant;
use App\Models\MessageAssistant;
use App\Services\Assistant\AssistantBorneApp;
use App\Services\Assistant\AssistantIndisponible;
use App\Services\Assistant\ModeleIA;
use App\Services\Assistant\ModeleNonConfigure;
use App\Services\Assistant\OllamaModele;
use App\Services\Assistant\PlanificateurTrajet;
use App\Services\Assistant\QuotaAssistantAtteint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

/** Assistant IA du client (application mobile et espace client web). */
class AssistantController extends Controller
{
    public function __construct(private readonly AssistantBorneApp $assistant) {}

    /** Disponibilité de l'assistant et questions restantes aujourd'hui. */
    public function etat(Request $request, ModeleIA $modele): JsonResponse
    {
        return response()->json([
            'disponible' => ! $modele instanceof ModeleNonConfigure && (! $modele instanceof OllamaModele || $modele->estDisponible()),
            'questionsRestantes' => $this->assistant->questionsRestantes($request->user()),
            'questionsParJour' => (int) config('assistant.questions_gratuites_par_jour'),
        ]);
    }

    /** Villes proposées par le planificateur de trajet. */
    public function villes(): JsonResponse
    {
        return response()->json(PlanificateurTrajet::villes());
    }

    /** « Trajet Volta » : arrêts recharge, batterie, temps et coût d'un voyage, commentés par l'IA. */
    public function trajet(Request $request, PlanificateurTrajet $planificateur): JsonResponse
    {
        $villes = array_keys(PlanificateurTrajet::VILLES);
        // Un point est une ville du catalogue (clé) ou une position {nom, lat, lng} en Tunisie.
        $point = fn (string $champ) => is_array($request->input($champ)) ? [
            $champ => ['required', 'array'],
            "{$champ}.nom" => ['required', 'string', 'max:120'],
            "{$champ}.lat" => ['required', 'numeric', 'between:30,38'],
            "{$champ}.lng" => ['required', 'numeric', 'between:7,12'],
        ] : [$champ => ['required', 'string', Rule::in($villes)]];
        $data = $request->validate([
            ...$point('depart'),
            ...$point('arrivee'),
            'batterie' => ['nullable', 'integer', 'between:5,100'],
            'arrets' => ['nullable', 'array', 'max:3'],
            'arrets.*' => ['integer', 'exists:bornes,id'],
        ]);

        $resoudre = function (string $champ) use ($data) {
            $v = $data[$champ];
            if (is_string($v)) {
                return PlanificateurTrajet::ville($v);
            }

            return ['nom' => (string) $v['nom'], 'lat' => (float) $v['lat'], 'lng' => (float) $v['lng']];
        };
        $a = $resoudre('depart');
        $b = $resoudre('arrivee');
        if (abs($a['lat'] - $b['lat']) < 0.002 && abs($a['lng'] - $b['lng']) < 0.002) {
            return response()->json(['message' => 'Choisissez une destination différente du départ.', 'errors' => ['arrivee' => ['Choisissez une destination différente du départ.']]], 422);
        }

        return response()->json($planificateur->planifier($request->user(), $a, $b, $data['batterie'] ?? null, $data['arrets'] ?? []));
    }

    /** Nom du lieu touché sur la carte (pour choisir une destination n'importe où). */
    public function lieuAuPoint(Request $request, PlanificateurTrajet $planificateur): JsonResponse
    {
        $data = $request->validate(['lat' => ['required', 'numeric', 'between:30,38'], 'lng' => ['required', 'numeric', 'between:7,12']]);

        return response()->json($planificateur->lieuAuPoint((float) $data['lat'], (float) $data['lng']));
    }

    /** Recherche de lieux (villes, adresses) pour choisir une destination, comme dans une appli de cartes. */
    public function lieux(Request $request, PlanificateurTrajet $planificateur): JsonResponse
    {
        $q = $request->validate(['q' => ['required', 'string', 'min:2', 'max:100']])['q'];

        return response()->json($planificateur->rechercherLieux($q));
    }

    public function poser(Request $request): JsonResponse
    {
        $data = $request->validate([
            'question' => ['required', 'string', 'max:'.config('assistant.longueur_max_question')],
            'conversationId' => ['nullable', 'uuid'],
        ]);
        $user = $request->user();

        // Une réponse à la fois par client : deux questions simultanées écraseraient l'historique.
        $verrou = Cache::lock("assistant:{$user->id}", (int) config('assistant.delai') * 3);
        if (! $verrou->get()) {
            return response()->json(['message' => 'Une réponse est déjà en cours de rédaction.'], 409);
        }

        try {
            $r = $this->assistant->poser($user, trim($data['question']), $data['conversationId'] ?? null);
        } catch (QuotaAssistantAtteint) {
            return response()->json([
                'message' => 'Vous avez utilisé vos '.config('assistant.questions_gratuites_par_jour').' questions gratuites du jour. Les abonnés profitent de l’assistant sans limite.',
                'quotaAtteint' => true,
            ], 429);
        } catch (AssistantIndisponible $e) {
            return response()->json(['message' => $e->getMessage()], 503);
        } finally {
            $verrou->release();
        }

        return response()->json([
            'conversationId' => $r['conversation']->id,
            'titre' => $r['conversation']->titre,
            'message' => $r['message']->versApi(),
            'questionsRestantes' => $r['questionsRestantes'],
        ]);
    }

    public function conversations(Request $request): JsonResponse
    {
        return response()->json(
            ConversationAssistant::where('user_id', $request->user()->id)
                ->withCount('messages')
                ->latest('derniere_activite')
                ->limit(50)
                ->get()
                ->map(fn (ConversationAssistant $c) => [
                    'id' => $c->id,
                    'titre' => $c->titre,
                    'messages' => $c->messages_count,
                    'derniereActivite' => $c->derniere_activite?->toIso8601String(),
                ])
        );
    }

    public function conversation(Request $request, string $id): JsonResponse
    {
        $conversation = ConversationAssistant::where('user_id', $request->user()->id)->findOrFail($id);

        return response()->json([
            'id' => $conversation->id,
            'titre' => $conversation->titre,
            'messages' => $conversation->messages->map(fn (MessageAssistant $m) => $m->versApi()),
        ]);
    }

    public function supprimer(Request $request, string $id): JsonResponse
    {
        ConversationAssistant::where('user_id', $request->user()->id)->findOrFail($id)->delete();

        return response()->json(['message' => 'Conversation supprimée.']);
    }
}
