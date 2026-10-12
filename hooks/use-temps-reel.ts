import { useEffect, useRef } from 'react';

import { API_URL_DEFAUT, getToken, USE_MOCK } from '@/lib/api';

/**
 * Relais temps réel du serveur OCPP (port 9222) : la borne pousse ses mesures,
 * l'app est prévenue aussitôt (session.maj pour ses propres recharges, borne.maj
 * pour la disponibilité des bornes). Reconnexion automatique avec délai croissant ;
 * les écrans gardent une actualisation périodique de secours.
 */
const LIVE_URL = process.env.EXPO_PUBLIC_LIVE_URL ?? `ws://${hoteApi()}:9222/live`;

function hoteApi(): string {
  try {
    return new URL(API_URL_DEFAUT).hostname;
  } catch {
    return 'localhost';
  }
}

export type EvenementTempsReel = 'session.maj' | 'borne.maj';

/** Appelle `surEvenement` à chaque événement reçu tant que `actif` est vrai. */
export function useTempsReel(actif: boolean, surEvenement: (evenement: EvenementTempsReel, donnees: Record<string, unknown>) => void) {
  const rappel = useRef(surEvenement);
  rappel.current = surEvenement;

  useEffect(() => {
    if (!actif || USE_MOCK) return;
    let ws: WebSocket | null = null;
    let ferme = false;
    let tentative = 0;
    let relance: ReturnType<typeof setTimeout> | undefined;

    const ouvrir = async () => {
      const token = await getToken();
      if (ferme || !token) return;
      ws = new WebSocket(`${LIVE_URL}?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        tentative = 0;
      };
      ws.onmessage = (e) => {
        try {
          const { evenement, donnees } = JSON.parse(String(e.data));
          if (evenement === 'session.maj' || evenement === 'borne.maj') rappel.current(evenement, donnees ?? {});
        } catch {
          // Message illisible : ignoré.
        }
      };
      ws.onclose = (e) => {
        // 4401 : jeton refusé, inutile d'insister.
        if (ferme || e.code === 4401) return;
        tentative += 1;
        relance = setTimeout(ouvrir, Math.min(30000, 1000 * 2 ** Math.min(tentative, 5)));
      };
    };

    void ouvrir();
    return () => {
      ferme = true;
      clearTimeout(relance);
      ws?.close();
    };
  }, [actif]);
}
