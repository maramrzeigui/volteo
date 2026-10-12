<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Message affiché dans le fil de l'assistant (question du client ou réponse). */
#[Fillable(['conversation_id', 'role', 'contenu', 'cartes', 'suggestions', 'erreur', 'jetons_entree', 'jetons_sortie'])]
class MessageAssistant extends Model
{
    protected $table = 'assistant_messages';

    public const UTILISATEUR = 'utilisateur';

    public const ASSISTANT = 'assistant';

    protected function casts(): array
    {
        return [
            'cartes' => 'array',
            'suggestions' => 'array',
            'erreur' => 'boolean',
        ];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(ConversationAssistant::class, 'conversation_id');
    }

    /** Format renvoyé à l'application. */
    public function versApi(): array
    {
        return [
            'id' => $this->id,
            'role' => $this->role,
            'contenu' => $this->contenu,
            'cartes' => $this->cartes ?? [],
            'suggestions' => $this->suggestions ?? [],
            'erreur' => $this->erreur,
            'date' => $this->created_at?->toIso8601String(),
        ];
    }
}
