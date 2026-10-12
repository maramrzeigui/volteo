<?php

namespace Database\Seeders;

use App\Models\Borne;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

/**
 * Photos réelles de bornes (Wikimedia Commons, licences libres) pour les bornes de démonstration.
 * Les licences CC BY / CC BY-SA imposent de créditer l'auteur : le crédit est affiché sous la photo.
 * Les vraies photos des bornes Volteo se téléversent ensuite depuis le back-office.
 */
class PhotosBornesSeeder extends Seeder
{
    private const PHOTOS = [
        'BRN-TUN-001' => ['lac-stuttgart.jpg', 'Julian Herzog · CC BY 4.0 · Wikimedia Commons'],
        'BRN-TUN-002' => ['centre-urbain-windsor.jpg', 'Chris Woodrich · CC BY-SA 4.0 · Wikimedia Commons'],
        'BRN-TUN-003' => ['marsa-cologne.jpg', 'CEphoto, Uwe Aranas · CC BY-SA 3.0 · Wikimedia Commons'],
        'BRN-SOU-001' => ['sousse-stuttgart.jpg', 'Alexander Migl · CC BY-SA 4.0 · Wikimedia Commons'],
        'BRN-SFX-001' => ['sfax-wiesbaden.jpg', 'Matti Blume · CC BY-SA 4.0 · Wikimedia Commons'],
        'BRN-NAB-001' => ['hammamet-vienne.jpg', 'D-Kuru · CC BY-SA 4.0 · Wikimedia Commons'],
        'BRN-BIZ-001' => ['bizerte-pise.jpg', 'Daniele Napolitano · CC BY-SA 4.0 · Wikimedia Commons'],
    ];

    public function run(): void
    {
        foreach (self::PHOTOS as $reference => [$fichier, $credit]) {
            $borne = Borne::where('reference', $reference)->first();
            // Une photo ajoutée depuis le back-office n'est jamais remplacée.
            if (! $borne || ($borne->photo && ! str_starts_with($borne->photo, 'bornes/demo-'))) {
                continue;
            }
            $chemin = 'bornes/demo-'.$fichier;
            Storage::disk('public')->put($chemin, file_get_contents(__DIR__.'/photos-bornes/'.$fichier));
            $borne->forceFill(['photo' => $chemin, 'photo_credit' => $credit])->save();
        }
    }
}
