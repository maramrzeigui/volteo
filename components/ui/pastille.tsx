import { Pressable, StyleSheet, View } from 'react-native';

import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  libelle: string;
  actif?: boolean;
  compteur?: number;
  icone?: NomIcone;
  onPress?: () => void;
};

/** Pastille de filtre sélectionnable. */
export function Pastille({ libelle, actif = false, compteur, icone, onPress }: Props) {
  const { c } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pastille,
        {
          backgroundColor: actif ? c.ink : c.surface,
          borderColor: actif ? c.ink : c.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      {icone && <Icone name={icone} size={16} color={actif ? 'onInk' : 'textMuted'} />}
      <Texte variant="captionStrong" color={actif ? 'onInk' : 'text'}>
        {libelle}
      </Texte>
      {compteur != null && (
        <View style={[styles.compteur, { backgroundColor: actif ? '#FFFFFF26' : c.surfaceAlt }]}>
          <Texte variant="captionStrong" color={actif ? 'onInk' : 'textMuted'} style={styles.chiffre}>
            {compteur}
          </Texte>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pastille: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: Rayons.pill,
    paddingLeft: 14,
    paddingRight: 8,
    height: 38,
  },
  compteur: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chiffre: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
