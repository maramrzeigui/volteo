import * as Speech from 'expo-speech';
import { useSyncExternalStore } from 'react';

/** Voix du guidage (synthèse vocale du téléphone, en français), coupable par le conducteur. */
let active = true;
const abonnes = new Set<() => void>();

export function voixActive() {
  return active;
}

export function activerVoix(valeur: boolean) {
  active = valeur;
  if (!valeur) Speech.stop();
  abonnes.forEach((a) => a());
}

export function useVoix() {
  return useSyncExternalStore(
    (a) => {
      abonnes.add(a);
      return () => abonnes.delete(a);
    },
    () => active
  );
}

/** Lit un texte à voix haute ; une alerte interrompt la consigne en cours. */
export function parler(texte: string, prioritaire = false) {
  if (!active) return;
  if (prioritaire) Speech.stop();
  Speech.speak(texte, { language: 'fr-FR', rate: 1.0, pitch: 1.0 });
}

/** Coupe la voix en cours (fin du guidage). */
export function taire() {
  Speech.stop();
}
