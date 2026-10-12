import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Texte } from '@/components/ui/texte';
import { useTheme } from '@/hooks/use-theme';
import { formatNombre } from '@/lib/format';
import type { StatMois } from '@/types/domain';

const HAUTEUR = 120;

function Barre({ ratio, index, actif }: { ratio: number; index: number; actif: boolean }) {
  const { c } = useTheme();
  const croissance = useSharedValue(0);

  useEffect(() => {
    croissance.value = withDelay(
      index * 70,
      withTiming(ratio, { duration: 700, easing: Easing.out(Easing.cubic) })
    );
  }, [ratio, index, croissance]);

  const style = useAnimatedStyle(() => ({ height: Math.max(4, HAUTEUR * croissance.value) }));

  return (
    <Animated.View
      style={[styles.barre, { backgroundColor: actif ? c.primary : c.surfaceAlt }, style]}
    />
  );
}

/** Énergie rechargée par mois : barres qui poussent l'une après l'autre, mois courant en vert. */
export function BarresMois({ donnees }: { donnees: StatMois[] }) {
  const max = Math.max(1, ...donnees.map((d) => d.kwh));

  return (
    <View style={styles.conteneur}>
      {donnees.map((d, i) => {
        const actif = i === donnees.length - 1;
        const mois = new Date(`${d.mois}-01T12:00:00`)
          .toLocaleDateString('fr-FR', { month: 'short' })
          .replace('.', '');
        return (
          <View key={d.mois} style={styles.colonne}>
            <Texte
              variant="captionStrong"
              color={actif ? 'primary' : 'textMuted'}
              style={styles.valeur}>
              {d.kwh > 0 ? formatNombre(d.kwh, 0) : ''}
            </Texte>
            <View style={styles.piste}>
              <Barre ratio={d.kwh / max} index={i} actif={actif} />
            </View>
            <Texte variant="label" color={actif ? 'text' : 'textFaint'} style={styles.mois}>
              {mois}
            </Texte>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  colonne: { flex: 1, alignItems: 'center', gap: 6 },
  valeur: { fontSize: 11, fontVariant: ['tabular-nums'] },
  piste: { height: HAUTEUR, width: '100%', justifyContent: 'flex-end' },
  barre: { width: '100%', borderRadius: 8 },
  mois: { fontSize: 10 },
});
