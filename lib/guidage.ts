import type { InstructionGuidage } from '@/types/domain';

/** Distance en mètres entre deux points GPS. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** « 350 m », « 1,2 km » : distances lisibles au volant. */
export function formatDistance(m: number) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: m < 10000 ? 1 : 0 })} km`;
}

/**
 * Prochaine manœuvre : on passe à l'instruction suivante dès que le conducteur arrive
 * à moins de 30 m de la manœuvre en cours (ou s'il est plus proche de la suivante).
 */
export function avancer(instructions: InstructionGuidage[], index: number, pos: { lat: number; lng: number }) {
  let i = index;
  while (i < instructions.length - 1) {
    const ici = distanceM(pos, instructions[i]);
    const suivante = distanceM(pos, instructions[i + 1]);
    if (ici < 30 || suivante < ici - 50) i++;
    else break;
  }
  return i;
}

/** Distance restante : jusqu'à la manœuvre en cours, puis la somme des tronçons suivants. */
export function resteM(instructions: InstructionGuidage[], index: number, pos: { lat: number; lng: number }) {
  if (!instructions.length) return 0;
  const jusqua = distanceM(pos, instructions[index]);
  return jusqua + instructions.slice(index, -1).reduce((t, x) => t + x.distanceM, 0);
}

/** Ouvre le trajet dans l'appli de cartes du téléphone (guidage vocal). */
export function urlCartesNatives(dest: { lat: number; lng: number }, ios: boolean) {
  return ios
    ? `http://maps.apple.com/?daddr=${dest.lat},${dest.lng}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`;
}
