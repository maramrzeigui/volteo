<?php

namespace App\Services\Assistant;

use App\Models\ConversationAssistant;
use App\Models\MessageAssistant;
use App\Models\Parametre;
use App\Models\SessionRecharge;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Orchestration d'une question à l'assistant :
 * quota → historique (ajout seul) → boucle modèle / outils → réponse + cartes.
 *
 * L'historique envoyé au modèle est conservé tel quel (blocs de réflexion
 * compris) et renvoyé à l'identique : le prompt système et les outils restent
 * stables, le contexte variable est ajouté en message système après la question.
 */
class AssistantBorneApp
{
    /** Message affiché quand le modèle décline la demande. */
    private const REPONSE_REFUS = 'Je ne peux pas vous aider sur ce point. Je reste à votre disposition pour vos recharges, les bornes et votre compte.';

    private const REPONSE_VIDE = 'Je n’ai pas pu terminer ma recherche. Pouvez-vous reformuler votre question ?';

    public function __construct(
        private readonly ModeleIA $modele,
        private readonly OutilsBorneApp $outils,
    ) {}

    /** Questions restantes aujourd'hui (null = illimité pour les abonnés). */
    public function questionsRestantes(User $user): ?int
    {
        if ($user->souscriptionActive()) {
            return null;
        }

        $fuseau = Parametre::get('fuseau_horaire', 'UTC');
        $posees = MessageAssistant::query()
            ->whereHas('conversation', fn ($q) => $q->where('user_id', $user->id))
            ->where('role', MessageAssistant::UTILISATEUR)
            ->where('created_at', '>=', now($fuseau)->startOfDay()->utc())
            ->count();

        return max(0, (int) config('assistant.questions_gratuites_par_jour') - $posees);
    }

    /**
     * @return array{conversation: ConversationAssistant, message: MessageAssistant, questionsRestantes: ?int}
     *
     * @throws QuotaAssistantAtteint
     * @throws AssistantIndisponible
     */
    public function poser(User $user, string $question, ?string $conversationId = null): array
    {
        if ($this->questionsRestantes($user) === 0) {
            throw new QuotaAssistantAtteint;
        }

        $conversation = $conversationId
            ? ConversationAssistant::where('user_id', $user->id)->findOrFail($conversationId)
            : new ConversationAssistant(['user_id' => $user->id, 'titre' => Str::limit($question, 60), 'historique' => []]);

        $historique = $conversation->historique ?? [];
        if (count($historique) >= config('assistant.max_messages_par_conversation')) {
            throw new AssistantIndisponible('Cette conversation est longue : démarrez-en une nouvelle pour continuer.');
        }

        // Ajout seul : la question, puis le contexte du moment (message système non visible).
        $historique[] = ['role' => 'user', 'content' => $question];
        $historique[] = ['role' => 'system', 'content' => $this->contexte($user)];

        $cartes = [];
        $outilsUtilises = [];
        $jetons = ['entree' => 0, 'sortie' => 0];
        $texte = '';

        for ($tour = 0; $tour < config('assistant.max_iterations'); $tour++) {
            $reponse = $this->appeler($historique);
            $jetons['entree'] += (int) ($reponse['usage']['input_tokens'] ?? 0);
            $jetons['sortie'] += (int) ($reponse['usage']['output_tokens'] ?? 0);

            $contenu = $reponse['content'] ?? [];
            $arret = $reponse['stop_reason'] ?? null;

            if ($arret !== 'tool_use') {
                // Un appel d'outil coupé (max_tokens) resterait sans résultat : il n'entre pas dans l'historique.
                $contenu = array_values(array_filter($contenu, fn ($b) => ($b['type'] ?? null) !== 'tool_use'));
            }
            if ($arret === 'refusal') {
                $texte = self::REPONSE_REFUS;
            }
            // Un tour assistant vide est refusé par l'API au tour suivant : on garde la réponse affichée.
            if (! collect($contenu)->contains(fn ($b) => in_array($b['type'] ?? null, ['text', 'tool_use'], true))) {
                $contenu[] = ['type' => 'text', 'text' => $texte !== '' ? $texte : self::REPONSE_VIDE];
            }
            $historique[] = ['role' => 'assistant', 'content' => $contenu];

            if ($arret === 'refusal') {
                break;
            }

            $appels = array_values(array_filter($contenu, fn ($b) => ($b['type'] ?? null) === 'tool_use'));
            if ($arret !== 'tool_use' || $appels === []) {
                $texte = $this->texte($contenu);
                break;
            }

            // Tous les résultats d'outils dans un seul message utilisateur.
            $resultats = [];
            foreach ($appels as $appel) {
                $execution = $this->outils->executer($appel['name'], (array) ($appel['input'] ?? []), $user);
                $outilsUtilises[] = $appel['name'];
                array_push($cartes, ...$execution['cartes']);
                $resultats[] = array_filter([
                    'type' => 'tool_result',
                    'tool_use_id' => $appel['id'],
                    'content' => json_encode($execution['resultat'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'is_error' => $execution['erreur'] ?: null,
                ], fn ($v) => $v !== null);
            }
            $historique[] = ['role' => 'user', 'content' => $resultats];
        }

        if ($texte === '') {
            $texte = self::REPONSE_VIDE;
        }

        $message = DB::transaction(function () use ($conversation, $historique, $question, $texte, $cartes, $outilsUtilises, $jetons) {
            $conversation->historique = $historique;
            $conversation->derniere_activite = now();
            $conversation->save();

            $conversation->messages()->create(['role' => MessageAssistant::UTILISATEUR, 'contenu' => $question]);

            return $conversation->messages()->create([
                'role' => MessageAssistant::ASSISTANT,
                'contenu' => $texte,
                'cartes' => $this->dedoublonner($cartes),
                'suggestions' => $this->suggestions($outilsUtilises),
                'jetons_entree' => $jetons['entree'],
                'jetons_sortie' => $jetons['sortie'],
            ]);
        });

        return [
            'conversation' => $conversation,
            'message' => $message,
            'questionsRestantes' => $this->questionsRestantes($user),
        ];
    }

    /** Appel au modèle, avec une reprise unique si l'historique n'est plus compatible. */
    private function appeler(array &$historique): array
    {
        $system = [[
            'type' => 'text',
            'text' => Connaissances::promptSysteme(Parametre::get('plateforme_nom', 'Volteo')),
            'cache_control' => ['type' => 'ephemeral'],
        ]];

        try {
            return $this->modele->repondre($system, $historique, $this->outils->definitions());
        } catch (HistoriqueIncompatible $e) {
            // Prompt ou outils modifiés par une mise à jour : la réflexion des tours
            // précédents ne peut plus être relue. Reprise ponctuelle sans ces blocs.
            Log::info('Assistant : historique sans blocs de réflexion après mise à jour', ['message' => $e->getMessage()]);
            $historique = array_map(fn (array $m) => is_array($m['content'])
                ? [...$m, 'content' => array_values(array_filter($m['content'], fn ($b) => ! in_array($b['type'] ?? null, ['thinking', 'redacted_thinking'], true)))]
                : $m, $historique);

            return $this->modele->repondre($system, $historique, $this->outils->definitions());
        }
    }

    /** Contexte du moment, ajouté après chaque question (le prompt système reste stable). */
    private function contexte(User $user): string
    {
        $fuseau = Parametre::get('fuseau_horaire', 'UTC');
        $maintenant = now($fuseau)->locale('fr');
        $enCours = $user->sessions()->whereIn('etat', SessionRecharge::ETATS_ACTIFS)->exists();

        return 'Contexte du client (non visible) : '.$maintenant->isoFormat('dddd D MMMM YYYY, HH:mm')." ({$fuseau}). "
            .'Prénom : '.($user->prenom ?: 'inconnu').'. '
            .'Recharge en cours : '.($enCours ? 'oui' : 'non').'.';
    }

    private function texte(array $contenu): string
    {
        return trim(collect($contenu)->where('type', 'text')->pluck('text')->join("\n\n"));
    }

    /** Une carte par borne / type, la plus récente l'emporte, ordre d'apparition conservé. */
    private function dedoublonner(array $cartes): array
    {
        $uniques = [];
        foreach ($cartes as $carte) {
            $uniques[$carte['type'].':'.($carte['borneId'] ?? $carte['sessionId'] ?? '')] = $carte;
        }

        return array_slice(array_values($uniques), 0, 8);
    }

    /** Relances proposées sous la réponse, selon ce qui vient d'être consulté. */
    private function suggestions(array $outilsUtilises): array
    {
        $propositions = [
            'rechercher_bornes' => ['Laquelle recharge le plus vite ?', 'Combien coûte une recharge de 20 à 80 % ?'],
            'details_borne' => ['Estimer le prix de 20 à 80 %', 'Y a-t-il des heures creuses ?'],
            'estimer_recharge' => ['Comment payer moins cher ?', 'Quelles bornes sont libres maintenant ?'],
            'mon_compte' => ['Voir les abonnements', 'Mes dernières recharges'],
            'mes_recharges' => ['Combien ai-je dépensé ce mois-ci ?', 'Voir les abonnements'],
            'offres_abonnement' => ['Quelle formule me convient ?', 'Mon solde et mon abonnement'],
        ];

        $dernier = end($outilsUtilises) ?: null;

        return $propositions[$dernier] ?? ['Bornes libres près de moi', 'Comment fonctionne la réservation ?'];
    }
}
