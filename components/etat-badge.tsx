import { StyleSheet, View } from 'react-native';

import { Texte } from '@/components/ui/texte';
import { EtatBorneCouleurs, Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  etat: string;
  /** Variante pour fond bleu nuit (en-têtes). */
  surEncre?: boolean;
};

export function EtatBadge({ etat, surEncre = false }: Props) {
  const { c } = useTheme();
  const info = EtatBorneCouleurs[etat] ?? { label: etat, couleur: 'neutral' as const };
  const couleur = c[info.couleur];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: surEncre ? '#FFFFFF14' : `${couleur}1F` },
      ]}>
      <View style={[styles.point, { backgroundColor: couleur, shadowColor: couleur }]} />
      <Texte variant="captionStrong" color={surEncre ? c.onInk : couleur} style={styles.texte}>
        {info.label}
      </Texte>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Rayons.pill,
    paddingHorizontal: 10,
    height: 26,
    alignSelf: 'flex-start',
  },
  point: {
    width: 7,
    height: 7,
    borderRadius: 4,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  texte: { fontSize: 12 },
});
