import { forwardRef } from 'react';

export type CarteBornesRef = { recentrer: () => void };

/** Sur le web, l'onglet Carte utilise sa carte Leaflet (iframe) : pas de carte native. */
export const CarteBornes = forwardRef<CarteBornesRef, Record<string, unknown>>(function CarteBornes() {
  return null;
});
