<?php

namespace App\Services;

use App\Models\Alerte;
use App\Models\NotificationEnvoyee;
use App\Models\Parametre;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Module 12 — notification des alertes par email, SMS et push selon les
 * règles paramétrées par gravité (module 17). Chaque envoi est tracé.
 */
class Notifications
{
    public function __construct(private readonly OcppClient $ocpp) {}

    public function notifierAlerte(Alerte $alerte): void
    {
        $alerte->loadMissing('borne.technicien');
        $regles = Parametre::get('notifications_regles', []);
        $canaux = $regles[$alerte->gravite] ?? [];

        $sujet = sprintf('[%s] %s — %s', strtoupper($alerte->gravite), $alerte->borne->nom, str_replace('_', ' ', $alerte->type));
        $contenu = $alerte->message."\nBorne : {$alerte->borne->nom} ({$alerte->borne->reference})\nAdresse : {$alerte->borne->adresse}";

        if (in_array('email', $canaux, true)) {
            $destinataires = collect(Parametre::get('email_alertes_destinataires', []))
                ->push($alerte->borne->technicien?->email)
                ->filter()
                ->unique();
            foreach ($destinataires as $email) {
                $this->email($alerte, $email, $sujet, $contenu);
            }
        }

        if (in_array('sms', $canaux, true)) {
            $numeros = collect(Parametre::get('sms_destinataires', []))
                ->push($alerte->borne->technicien?->telephone)
                ->filter()
                ->unique();
            foreach ($numeros as $numero) {
                $this->sms($alerte, $numero, $sujet);
            }
        }

        if (in_array('push', $canaux, true)) {
            $this->push($alerte, $sujet, $contenu);
        }
    }

    public function email(?Alerte $alerte, string $destinataire, string $sujet, string $contenu): NotificationEnvoyee
    {
        try {
            Mail::raw($contenu, function ($mail) use ($destinataire, $sujet) {
                $mail->from(Parametre::get('email_expediteur'), Parametre::get('plateforme_nom'))
                    ->to($destinataire)
                    ->subject($sujet);
            });

            return $this->tracer($alerte, 'email', $destinataire, $sujet, $contenu, 'envoyee');
        } catch (\Throwable $e) {
            return $this->tracer($alerte, 'email', $destinataire, $sujet, $contenu, 'echec', $e->getMessage());
        }
    }

    /**
     * SMS : le fournisseur « log » écrit le message dans les logs (développement).
     * Brancher ici l'API du fournisseur retenu (Tunisie Télécom, Ooredoo, Twilio…).
     */
    public function sms(?Alerte $alerte, string $numero, string $texte): NotificationEnvoyee
    {
        if (! Parametre::get('sms_actif')) {
            return $this->tracer($alerte, 'sms', $numero, 'SMS', $texte, 'desactive');
        }

        Log::info('[SMS via '.Parametre::get('sms_fournisseur')."] {$numero} : {$texte}");

        return $this->tracer($alerte, 'sms', $numero, 'SMS', $texte, 'envoyee');
    }

    /** Push : notification instantanée dans le back-office (WebSocket) et l'app mobile. */
    public function push(?Alerte $alerte, string $titre, string $contenu): NotificationEnvoyee
    {
        if (! Parametre::get('push_actif')) {
            return $this->tracer($alerte, 'push', 'back-office', $titre, $contenu, 'desactive');
        }

        if (TempsReel::actif()) {
            $this->ocpp->diffuser('notification', ['titre' => $titre, 'contenu' => $contenu, 'gravite' => $alerte?->gravite ?? 'info']);
        }

        return $this->tracer($alerte, 'push', 'back-office', $titre, $contenu, 'envoyee');
    }

    private function tracer(?Alerte $alerte, string $canal, string $destinataire, string $sujet, string $contenu, string $statut, ?string $erreur = null): NotificationEnvoyee
    {
        return NotificationEnvoyee::create([
            'alerte_id' => $alerte?->id,
            'canal' => $canal,
            'destinataire' => $destinataire,
            'sujet' => $sujet,
            'contenu' => $contenu,
            'statut' => $statut,
            'erreur' => $erreur ? mb_substr($erreur, 0, 250) : null,
        ]);
    }
}
