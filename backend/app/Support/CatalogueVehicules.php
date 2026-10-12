<?php

namespace App\Support;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;

/**
 * Modèles électriques courants en Tunisie, avec une vraie photo (Wikimedia Commons, licence libre :
 * l'auteur est crédité sous la photo), la batterie utile, la prise rapide et la consommation moyenne.
 */
class CatalogueVehicules
{
    /** cle => [marque, modèle, motif de reconnaissance, batterie kWh, prise, kWh/100 km, crédit] */
    public const MODELES = [
        'renault-megane-e-tech' => ['Renault', 'Mégane E-Tech', '/m[ée]gane/iu', 60, 'CCS', 16.1, 'Alexander Migl · CC BY-SA 4.0'],
        'renault-zoe' => ['Renault', 'Zoe', '/zo[ée]/iu', 52, 'CCS', 17.2, 'Vauxford · CC BY-SA 4.0'],
        'dacia-spring' => ['Dacia', 'Spring', '/spring/iu', 27, 'CCS', 13.9, 'Alexander Migl · CC BY-SA 4.0'],
        'peugeot-e-208' => ['Peugeot', 'e-208', '/e-?208/iu', 51, 'CCS', 15.4, 'Alexander-93 · CC BY-SA 4.0'],
        'citroen-e-c4' => ['Citroën', 'ë-C4', '/c4/iu', 54, 'CCS', 16.6, 'Alexander-93 · CC BY-SA 4.0'],
        'tesla-model-3' => ['Tesla', 'Model 3', '/model ?3/iu', 75, 'CCS', 14.4, 'James Young · CC BY-SA 2.0'],
        'tesla-model-y' => ['Tesla', 'Model Y', '/model ?y/iu', 75, 'CCS', 16.9, 'Alexander Migl · CC BY-SA 4.0'],
        'hyundai-kona-electric' => ['Hyundai', 'Kona Electric', '/kona/iu', 64, 'CCS', 15.4, 'PantheraLeo1359531 · CC BY 4.0'],
        'kia-ev6' => ['Kia', 'EV6', '/ev ?6/iu', 77, 'CCS', 17.2, 'Alexander-93 · CC BY-SA 4.0'],
        'byd-atto-3' => ['BYD', 'Atto 3', '/atto/iu', 60, 'CCS', 16.0, 'Alexander Migl · CC BY-SA 4.0'],
        'byd-dolphin' => ['BYD', 'Dolphin', '/dolphin/iu', 60, 'CCS', 15.9, 'Alexander-93 · CC BY-SA 4.0'],
        'mg4' => ['MG', 'MG4 Electric', '/mg ?4/iu', 64, 'CCS', 16.0, 'Alexander Migl · CC BY-SA 4.0'],
        'volkswagen-id4' => ['Volkswagen', 'ID.4', '/id\.? ?4/iu', 77, 'CCS', 17.3, 'Alexander Migl · CC BY-SA 4.0'],
        'nissan-leaf' => ['Nissan', 'Leaf', '/leaf/iu', 39, 'CHAdeMO', 16.4, 'EurovisionNim · CC BY-SA 4.0'],
        'bmw-ix3' => ['BMW', 'iX3', '/ix ?3/iu', 74, 'CCS', 18.5, 'Alexander-93 · CC BY-SA 4.0'],
        'mercedes-eqa' => ['Mercedes-Benz', 'EQA', '/eqa/iu', 67, 'CCS', 17.7, 'Elizbeth smith · CC BY-SA 4.0'],
    ];

    /** Modèle du catalogue correspondant à un véhicule saisi (marque + modèle libres). */
    public static function trouver(?string $marque, ?string $modele): ?string
    {
        $texte = trim("{$marque} {$modele}");
        foreach (self::MODELES as $cle => [$m, , $motif]) {
            if (preg_match($motif, (string) $modele) && stripos($texte, explode('-', $m)[0]) !== false) {
                return $cle;
            }
        }
        foreach (self::MODELES as $cle => [, , $motif]) {
            if (preg_match($motif, (string) $modele)) {
                return $cle;
            }
        }

        return null;
    }

    /** @return array{photoUrl: string, photoCredit: string}|null */
    public static function photo(?string $marque, ?string $modele): ?array
    {
        $cle = self::trouver($marque, $modele);
        if (! $cle) {
            return null;
        }
        $chemin = "vehicules/{$cle}.jpg";
        // Copie paresseuse depuis les sources du dépôt vers le stockage public.
        if (! Storage::disk('public')->exists($chemin) && File::exists($source = database_path("seeders/photos-vehicules/{$cle}.jpg"))) {
            Storage::disk('public')->put($chemin, File::get($source));
        }

        return ['photoUrl' => '/storage/'.$chemin, 'photoCredit' => self::MODELES[$cle][6].' · Wikimedia Commons'];
    }

    /** Liste pour le choix du modèle à l'ajout d'un véhicule. */
    public static function liste(): array
    {
        return collect(self::MODELES)->map(fn ($m, $cle) => [
            'cle' => $cle, 'marque' => $m[0], 'modele' => $m[1], 'capaciteBatterieKwh' => $m[3], 'typeConnecteur' => $m[4],
            'consommationKwh100' => $m[5], ...self::photo($m[0], $m[1]),
        ])->values()->all();
    }
}
