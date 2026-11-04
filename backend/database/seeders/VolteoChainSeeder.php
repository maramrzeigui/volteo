<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/** Volteo Chain : compte fabricant de démonstration (mot de passe de démo « password »). */
class VolteoChainSeeder extends Seeder
{
    public function run(): void
    {
        User::firstOrCreate(['email' => 'fabricant@volteo.tn'], [
            'name' => 'Renault Batteries',
            'prenom' => 'Renault',
            'nom' => 'Batteries',
            'role' => 'fabricant',
            'actif' => true,
            'password' => 'password',
        ]);
    }
}
