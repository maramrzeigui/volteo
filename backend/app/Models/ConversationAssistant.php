<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Conversation d'un client avec l'assistant IA. */
#[Fillable(['user_id', 'titre', 'historique', 'derniere_activite'])]
#[Hidden(['historique'])]
class ConversationAssistant extends Model
{
    use HasUuids;

    protected $table = 'assistant_conversations';

    protected $attributes = ['historique' => '[]'];

    protected function casts(): array
    {
        return [
            'historique' => 'array',
            'derniere_activite' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(MessageAssistant::class, 'conversation_id')->orderBy('id');
    }
}
