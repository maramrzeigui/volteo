import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import * as api from '@/lib/api';

/** Favoris du client, rechargés à chaque retour sur l'écran ; bascule optimiste. */
export function useFavoris() {
  const [ids, setIds] = useState<Set<number>>(new Set());

  useFocusEffect(
    useCallback(() => {
      api
        .favoris()
        .then((liste) => setIds(new Set(liste)))
        .catch(() => undefined);
    }, [])
  );

  const basculer = useCallback(
    async (borneId: number) => {
      const devient = !ids.has(borneId);
      setIds((avant) => {
        const suivant = new Set(avant);
        if (devient) suivant.add(borneId);
        else suivant.delete(borneId);
        return suivant;
      });
      try {
        await api.basculerFavori(borneId, devient);
      } catch {
        setIds((avant) => {
          const retour = new Set(avant);
          if (devient) retour.delete(borneId);
          else retour.add(borneId);
          return retour;
        });
      }
    },
    [ids]
  );

  return { ids, basculer };
}
