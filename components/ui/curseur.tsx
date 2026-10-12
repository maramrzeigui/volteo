import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Texte } from '@/components/ui/texte';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  libelle: string;
  valeur: number;
  min?: number;
  max?: number;
  pas?: number;
  unite?: string;
  onChange: (valeur: number) => void;
};

const POUCE = 28;

/** Curseur tactile (glisser ou toucher la piste), valeur arrondie au pas. */
export function Curseur({ libelle, valeur, min = 0, max = 100, pas = 5, unite = '%', onChange }: Props) {
  const { c } = useTheme();
  const [largeur, setLargeur] = useState(0);
  const x = useSharedValue(0);
  const origine = useSharedValue(0);
  const presse = useSharedValue(0);

  const course = Math.max(1, largeur - POUCE);

  useEffect(() => {
    if (largeur > 0) x.value = withSpring(((valeur - min) / (max - min)) * course, { damping: 20 });
  }, [valeur, largeur, min, max, course, x]);

  const versValeur = (px: number) => {
    'worklet';
    const brut = min + (Math.min(Math.max(px, 0), course) / course) * (max - min);
    return Math.round(brut / pas) * pas;
  };

  const glisser = Gesture.Pan()
    .onBegin((e) => {
      origine.value = e.x - POUCE / 2;
      x.value = Math.min(Math.max(origine.value, 0), course);
      presse.value = withSpring(1);
      runOnJS(onChange)(versValeur(x.value));
    })
    .onUpdate((e) => {
      x.value = Math.min(Math.max(origine.value + e.translationX, 0), course);
      runOnJS(onChange)(versValeur(x.value));
    })
    .onFinalize(() => {
      presse.value = withSpring(0);
    });

  const remplissage = useAnimatedStyle(() => ({ width: x.value + POUCE / 2 }));
  const pouce = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scale: 1 + presse.value * 0.15 }],
  }));

  return (
    <View style={styles.bloc}>
      <View style={styles.entete}>
        <Texte variant="captionStrong" color="textMuted">
          {libelle}
        </Texte>
        <Texte variant="subheading" style={styles.chiffres}>
          {valeur}
          {unite}
        </Texte>
      </View>
      <GestureDetector gesture={glisser}>
        <View
          style={styles.zone}
          onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel={libelle}
          accessibilityValue={{ min, max, now: valeur }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) =>
            onChange(
              Math.min(max, Math.max(min, valeur + (e.nativeEvent.actionName === 'increment' ? pas : -pas)))
            )
          }>
          <View style={[styles.piste, { backgroundColor: c.surfaceAlt }]}>
            <Animated.View style={[styles.remplissage, { backgroundColor: c.primary }, remplissage]} />
          </View>
          <Animated.View
            style={[
              styles.pouce,
              { backgroundColor: c.surface, borderColor: c.primary, shadowColor: c.primary },
              pouce,
            ]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: 8 },
  entete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chiffres: { fontVariant: ['tabular-nums'] },
  zone: { height: POUCE + 8, justifyContent: 'center' },
  piste: { height: 8, borderRadius: 4, overflow: 'hidden' },
  remplissage: { height: 8, borderRadius: 4 },
  pouce: {
    position: 'absolute',
    left: 0,
    width: POUCE,
    height: POUCE,
    borderRadius: POUCE / 2,
    borderWidth: 3,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
