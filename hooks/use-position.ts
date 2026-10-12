import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import type { PointTrajet } from '@/types/domain';

export type StatutPosition = 'recherche' | 'trouvee' | 'refusee' | 'indisponible';

/**
 * Position actuelle du conducteur (autorisation demandée à l'usage). Sans autorisation,
 * l'app reste utilisable : le départ se choisit alors à la main.
 */
export function usePosition() {
  const [position, setPosition] = useState<PointTrajet | null>(null);
  const [statut, setStatut] = useState<StatutPosition>('recherche');

  const localiser = useCallback(async () => {
    setStatut('recherche');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setStatut('refusee');
        return null;
      }
      // Dernière position connue d'abord (instantané), puis position précise.
      const rapide = await Location.getLastKnownPositionAsync();
      if (rapide) setPosition({ nom: 'Ma position', lat: rapide.coords.latitude, lng: rapide.coords.longitude });
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { nom: 'Ma position', lat: p.coords.latitude, lng: p.coords.longitude };
      setPosition(point);
      setStatut('trouvee');
      return point;
    } catch {
      setStatut('indisponible');
      return null;
    }
  }, []);

  useEffect(() => {
    localiser();
  }, [localiser]);

  return { position, statut, localiser };
}
