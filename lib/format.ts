/** Formats d'affichage (français, dinar tunisien). */

export function formatNombre(valeur: number | null | undefined, decimales = 0): string {
  if (valeur == null || Number.isNaN(valeur)) return '—';
  return valeur.toLocaleString('fr-FR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

export function formatPrix(valeur: number | null | undefined): string {
  return valeur == null ? '—' : `${formatNombre(valeur, 2)} DT`;
}

export function formatDuree(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

export function minutesDepuis(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

export function ilYa(iso: string | null | undefined): string {
  if (!iso) return 'jamais';
  const minutes = minutesDepuis(iso);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  return `il y a ${Math.round(heures / 24)} j`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function formatMois(iso: string): string {
  const texte = new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** « rayen » → « Rayen » (les noms saisis en minuscules s'affichent proprement). */
export function capitaliser(texte: string | null | undefined): string {
  return texte ? texte.charAt(0).toUpperCase() + texte.slice(1) : '';
}

export function salutation(): string {
  const heure = new Date().getHours();
  if (heure < 5 || heure >= 18) return 'Bonsoir';
  return 'Bonjour';
}
