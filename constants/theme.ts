/**
 * Système visuel Volteo — thème sombre graphite et rouge carmin adouci (moins saturé, plus élégant).
 * - « primary » / « electric » / « energy » : rouge vif pour le texte, les icônes et le décor (5:1).
 * - « action » : rouge des fonds pleins à texte blanc, boutons en tête (5,5:1).
 * - « ink » : noir profond des en-têtes et des cartes mises en avant.
 * - « copper » : prix et wallet (rose clair).
 * - États : rose = libre, carmin = en charge, platine = indisponible, gris = hors ligne.
 * L'app est sombre dans les deux modes du système : même palette pour « light » et « dark ».
 */

const SOMBRE = {
  background: '#111113',
  surface: '#1A1A1D',
  surfaceAlt: '#232327',
  text: '#F5F5F7',
  textMuted: '#A1A1AA',
  textFaint: '#8E8E99',
  border: '#2E2E36',

  /** Rouge vif pour le texte, les icônes, les bordures et les jauges (5:1 sur le fond). */
  primary: '#E5545F',
  primaryPressed: '#CC4652',
  /** Rouge des fonds pleins portant du texte blanc : boutons, puces sélectionnées (5,5:1). */
  action: '#B83A46',
  actionPressed: '#9E2F3A',
  primarySoft: '#2A181B',
  onPrimary: '#FFFFFF',
  energy: '#E5545F',

  ink: '#0D0D10',
  inkRaised: '#1E1E24',
  onInk: '#F5F5F7',
  onInkMuted: '#A1A1AA',
  electric: '#E5545F',

  /** Prix et wallet : rose clair de la marque (plus d'orange). */
  copper: '#F4CDC6',
  copperSoft: '#2A181B',

  // Palette monochrome : une seule famille rouge + neutres (ni vert, ni bleu, ni orange).
  success: '#F2A3AA',
  warning: '#D9D9E0',
  danger: '#FF5A6E',
  info: '#E5545F',
  neutral: '#8E8E99',

  // Compatibilité avec les composants du template Expo
  tint: '#E5545F',
  icon: '#A1A1AA',
  muted: '#A1A1AA',
  card: '#1B1B20',
  tabIconDefault: '#8E8E99',
  tabIconSelected: '#E5545F',
};

export const Colors = {
  light: SOMBRE,
  dark: SOMBRE,
};

export type Palette = (typeof Colors)['light'];
export type CouleurSemantique = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

/** Familles chargées dans app/_layout.tsx. Pas de fontWeight avec ces polices (Android l'ignore). */
export const Polices = {
  display: 'Outfit_700Bold',
  displayHeavy: 'Outfit_800ExtraBold',
  displaySemi: 'Outfit_600SemiBold',
  body: 'DMSans_500Medium',
  bodyRegular: 'DMSans_400Regular',
  bodySemi: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
};

export const Rayons = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const Espace = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 };

export const EtatBorneCouleurs: Record<string, { label: string; couleur: CouleurSemantique }> = {
  disponible: { label: 'Disponible', couleur: 'success' },
  occupee: { label: 'En charge', couleur: 'info' },
  indisponible: { label: 'Non disponible', couleur: 'warning' },
  hors_service: { label: 'Hors service', couleur: 'danger' },
  maintenance: { label: 'Maintenance', couleur: 'warning' },
  deconnectee: { label: 'Hors ligne', couleur: 'neutral' },
  defaut: { label: 'En défaut', couleur: 'danger' },
  inconnu: { label: 'Borne publique', couleur: 'neutral' },
};
