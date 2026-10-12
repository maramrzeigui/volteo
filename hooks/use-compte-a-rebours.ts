import { useEffect, useState } from 'react';

/** Secondes restantes avant `echeance` (ISO), rafraîchies chaque seconde. */
export function useCompteARebours(echeance: string | null | undefined): number {
  const calculer = () =>
    echeance ? Math.max(0, Math.round((new Date(echeance).getTime() - Date.now()) / 1000)) : 0;
  const [restant, setRestant] = useState(calculer);

  useEffect(() => {
    setRestant(calculer());
    if (!echeance) return;
    const timer = setInterval(() => setRestant(calculer()), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [echeance]);

  return restant;
}

export function formatMinSec(secondes: number): string {
  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
