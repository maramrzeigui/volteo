import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { VoitureElectrique } from '@/components/illustrations/voiture';

const LARGEUR_VOITURE = 150;
const RAYON_ROUE = 23 * (LARGEUR_VOITURE / 320);
const HAUTEUR = 96;

/**
 * Fin de recharge : la voiture, batterie pleine, quitte la borne.
 * Elle arrive en ralentissant, marque un temps, puis repart en accélérant avec
 * des traînées de vitesse ; les roues tournent exactement selon la distance parcourue.
 */
export function DepartVoiture({ largeur = 320 }: { largeur?: number }) {
  const reduit = useReducedMotion();
  const centre = (largeur - LARGEUR_VOITURE) / 2;
  const x = useSharedValue(reduit ? centre : -LARGEUR_VOITURE);

  useEffect(() => {
    if (reduit) return;
    x.value = withDelay(
      300,
      withRepeat(
        withSequence(
          withTiming(centre, { duration: 1300, easing: Easing.out(Easing.cubic) }),
          withTiming(centre, { duration: 1100 }),
          withTiming(largeur + 20, { duration: 1300, easing: Easing.in(Easing.cubic) }),
          withTiming(-LARGEUR_VOITURE, { duration: 0 }),
          withTiming(-LARGEUR_VOITURE, { duration: 500 }),
        ),
        -1,
        false,
        undefined,
        ReduceMotion.System,
      ),
    );
  }, [centre, largeur, reduit, x]);

  // Roulement sans glissement : angle = distance / rayon.
  const angle = useDerivedValue(() => ((x.value + LARGEUR_VOITURE) / RAYON_ROUE) * (180 / Math.PI));
  const styleVoiture = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  // Traînées visibles seulement quand la voiture va vite (entrée et sortie).
  const vitesse = useDerivedValue(() => {
    const d = Math.abs(x.value - centre);
    return interpolate(d, [0, 40, 160], [0, 0.4, 1], 'clamp');
  });
  const styleTrainees = useAnimatedStyle(() => ({
    opacity: vitesse.value,
    transform: [{ translateX: x.value - 46 }, { scaleX: 0.6 + vitesse.value * 0.6 }],
  }));

  return (
    <View style={{ width: largeur, height: HAUTEUR, overflow: 'hidden' }} accessible accessibilityLabel="La voiture rechargée reprend la route">
      <View style={[styles.route, { width: largeur }]} />
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.marquage, { left: 12 + i * (largeur / 5) }]} />
      ))}
      <Animated.View style={[styles.trainees, styleTrainees]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.trainee, { width: 34 - i * 8, marginLeft: i * 6 }]} />
        ))}
      </Animated.View>
      <Animated.View style={[styles.voiture, styleVoiture]}>
        <VoitureElectrique largeur={LARGEUR_VOITURE} rotationRoues={angle} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  route: { position: 'absolute', left: 0, bottom: 14, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF1A' },
  marquage: { position: 'absolute', bottom: 4, width: 22, height: 3, borderRadius: 1.5, backgroundColor: '#FFFFFF10' },
  voiture: { position: 'absolute', left: 0, bottom: 14 - 9 * (LARGEUR_VOITURE / 320) },
  trainees: { position: 'absolute', left: 0, bottom: 34, gap: 7 },
  trainee: { height: 2, borderRadius: 1, backgroundColor: '#E5545F99' },
});
