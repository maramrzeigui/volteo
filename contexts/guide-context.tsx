import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getItem, setItem } from '@/lib/storage';

/** Rectangle d'un onglet, en coordonnées écran (mesuré par la barre d'onglets). */
export type Zone = { x: number; y: number; largeur: number; hauteur: number };

const CLE_BIENVENUE = 'guide.bienvenue.vu';
const CLE_VISITE = 'guide.visite.vu';

type GuideContexte = {
  /** `null` tant que l'état n'est pas relu depuis le stockage. */
  bienvenueVue: boolean | null;
  visiteVue: boolean | null;
  terminerBienvenue: () => void;
  terminerVisite: () => void;
  /** Rejoue l'écran de bienvenue puis la visite guidée. */
  rejouer: () => void;
  zonesOnglets: Zone[];
  definirZonesOnglets: (zones: Zone[]) => void;
};

const Contexte = createContext<GuideContexte | null>(null);

/**
 * Guide de prise en main : écran de bienvenue au premier lancement,
 * puis visite guidée des onglets après la première connexion.
 */
export function GuideProvider({ children }: { children: ReactNode }) {
  const [bienvenueVue, setBienvenueVue] = useState<boolean | null>(null);
  const [visiteVue, setVisiteVue] = useState<boolean | null>(null);
  const [zonesOnglets, setZonesOnglets] = useState<Zone[]>([]);

  useEffect(() => {
    Promise.all([getItem(CLE_BIENVENUE), getItem(CLE_VISITE)])
      .then(([b, v]) => {
        setBienvenueVue(b === '1');
        setVisiteVue(v === '1');
      })
      .catch(() => {
        // Stockage indisponible : on ne bloque jamais l'utilisateur derrière le guide.
        setBienvenueVue(true);
        setVisiteVue(true);
      });
  }, []);

  const terminerBienvenue = useCallback(() => {
    setBienvenueVue(true);
    setItem(CLE_BIENVENUE, '1').catch(() => undefined);
  }, []);

  const terminerVisite = useCallback(() => {
    setVisiteVue(true);
    setItem(CLE_VISITE, '1').catch(() => undefined);
  }, []);

  const rejouer = useCallback(() => {
    setBienvenueVue(false);
    setVisiteVue(false);
    setItem(CLE_BIENVENUE, '0').catch(() => undefined);
    setItem(CLE_VISITE, '0').catch(() => undefined);
  }, []);

  const valeur = useMemo(
    () => ({
      bienvenueVue,
      visiteVue,
      terminerBienvenue,
      terminerVisite,
      rejouer,
      zonesOnglets,
      definirZonesOnglets: setZonesOnglets,
    }),
    [bienvenueVue, visiteVue, terminerBienvenue, terminerVisite, rejouer, zonesOnglets],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useGuide() {
  const contexte = useContext(Contexte);
  if (!contexte) throw new Error('useGuide doit être utilisé dans un GuideProvider');
  return contexte;
}
