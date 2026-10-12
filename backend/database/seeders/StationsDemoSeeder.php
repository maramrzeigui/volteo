<?php

namespace Database\Seeders;

use App\Models\Borne;
use App\Models\Station;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Deux stations clientes de démonstration, chacune avec son administrateur :
 * « Lac Énergie » (Grand Tunis, Bizerte) et « Sahel Charge » (Sousse, Sfax, Hammamet).
 * Idempotent : peut être relancé sans dupliquer.
 */
class StationsDemoSeeder extends Seeder
{
    private const STATIONS = [
        'Lac Énergie' => [
            'raison_sociale' => 'Lac Énergie SARL', 'ville' => 'Tunis', 'commission_pct' => 10, 'formule' => 'pro', 'bornes_max' => 20, 'couleur' => '#E5545F',
            'admin' => ['exploitant@borneapp.tn', 'Karim', 'Ben Salah'],
            'bornes' => ['BRN-TUN-001', 'BRN-TUN-002', 'BRN-TUN-003', 'BRN-BIZ-001'],
            'personnel' => ['technicien@borneapp.tn', 'operateur@borneapp.tn'],
        ],
        'Sahel Charge' => [
            'raison_sociale' => 'Sahel Charge SA', 'ville' => 'Sousse', 'commission_pct' => 8, 'formule' => 'entreprise', 'bornes_max' => null, 'couleur' => '#F2A3AA',
            'admin' => ['sahel@borneapp.tn', 'Amira', 'Trabelsi'],
            'bornes' => ['BRN-SOU-001', 'BRN-SFX-001', 'BRN-NAB-001'],
            'personnel' => ['technicien2@borneapp.tn'],
        ],
    ];

    public function run(): void
    {
        foreach (self::STATIONS as $nom => $d) {
            $station = Station::where('nom', $nom)->first()
                // Reprise de la station créée par la migration pour l'exploitant historique.
                ?? Station::whereHas('personnel', fn ($q) => $q->where('email', $d['admin'][0]))->first()
                ?? new Station;
            $station->fill([
                'nom' => $nom, 'raison_sociale' => $d['raison_sociale'], 'ville' => $d['ville'], 'email' => $d['admin'][0],
                'commission_pct' => $d['commission_pct'], 'formule' => $d['formule'], 'bornes_max' => $d['bornes_max'],
                'couleur' => $d['couleur'], 'statut' => 'actif', 'debut_contrat' => $station->debut_contrat ?? now()->startOfYear(),
            ])->save();

            [$email, $prenom, $nomFamille] = $d['admin'];
            $admin = User::firstOrNew(['email' => $email]);
            if (! $admin->exists) {
                $admin->fill(['name' => "{$prenom} {$nomFamille}", 'prenom' => $prenom, 'nom' => $nomFamille, 'password' => 'password', 'role' => 'exploitant']);
            }
            $admin->station_id = $station->id;
            $admin->save();

            User::whereIn('email', $d['personnel'])->update(['station_id' => $station->id]);
            Borne::withoutGlobalScopes()->whereIn('reference', $d['bornes'])->update(['station_id' => $station->id, 'exploitant_id' => $admin->id]);
        }
    }
}
