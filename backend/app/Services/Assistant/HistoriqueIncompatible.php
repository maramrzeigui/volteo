<?php

namespace App\Services\Assistant;

/**
 * L'API refuse l'historique : un bloc de réflexion ne correspond plus au préfixe
 * de la conversation (prompt système ou outils modifiés par une mise à jour).
 */
class HistoriqueIncompatible extends \RuntimeException {}
