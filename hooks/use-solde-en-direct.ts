import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { useTempsReel } from '@/hooks/use-temps-reel';
import * as api from '@/lib/api';

/**
 * Solde du wallet en direct : pendant une recharge, le prix en cours est déduit au fur et à mesure
 * (le débit définitif a lieu à la fin, au prix exact). À la fin, le solde réel est relu.
 */
export function useSoldeEnDirect() {
  const { utilisateur, rafraichirProfil } = useAuth();
  const [enCours, setEnCours] = useState(0);
  const [enCharge, setEnCharge] = useState(false);
  const avant = useRef(false);

  const lire = useCallback(async () => {
    const s = await api.sessionActive().catch(() => null);
    setEnCours(s?.prix ?? 0);
    setEnCharge(!!s);
    // Fin de recharge : le montant exact vient d'être débité, on relit le profil.
    if (avant.current && !s) rafraichirProfil().catch(() => undefined);
    avant.current = !!s;
  }, [rafraichirProfil]);

  useFocusEffect(
    useCallback(() => {
      lire();
      const t = setInterval(lire, 5000);
      return () => clearInterval(t);
    }, [lire])
  );
  useTempsReel(true, (evenement) => {
    if (evenement === 'session.maj') lire();
  });
  useEffect(() => {
    if (!enCharge) setEnCours(0);
  }, [enCharge]);

  const solde = utilisateur?.soldeWallet ?? 0;
  return { solde: Math.max(0, solde - enCours), enCours, enCharge };
}
