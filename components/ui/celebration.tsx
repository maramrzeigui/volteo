import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Icone } from '@/components/ui/icone';

const PARTICULES = 14;
const COULEURS = ['#E5545F', '#F2A3AA', '#FFFFFF', '#E5545F', '#F5F5F7'];

/** Une étincelle projetée depuis le centre, qui ralentit puis s'éteint. */
function Etincelle({ index, t }: { index: number; t: SharedValue<number> }) {
  const angle = (index / PARTICULES) * Math.PI * 2 + (index % 2 ? 0.2 : -0.1);
  const distance = 78 + (index % 3) * 22;
  const taille = index % 3 === 0 ? 10 : 7;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 0.75, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: Math.cos(angle) * distance * t.value },
      { translateY: Math.sin(angle) * distance * t.value },
      { scale: interpolate(t.value, [0, 0.3, 1], [0.3, 1.2, 0.4]) },
      { rotate: `${t.value * 180}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.etincelle,
        { width: taille, height: taille, borderRadius: index % 2 ? taille / 2 : 2, backgroundColor: COULEURS[index % COULEURS.length] },
        style,
      ]}
    />
  );
}

/** Fin de recharge : coche qui jaillit, onde d'énergie et étincelles. */
export function Celebration({ taille = 96 }: { taille?: number }) {
  const eclat = useSharedValue(0);
  const coche = useSharedValue(0);
  const onde = useSharedValue(0);

  useEffect(() => {
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    coche.value = withSpring(1, { damping: 9, stiffness: 160, reduceMotion: ReduceMotion.System });
    onde.value = withDelay(120, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
    eclat.value = withDelay(80, withTiming(1, { duration: 1100, easing: Easing.out(Easing.exp), reduceMotion: ReduceMotion.System }));
  }, [coche, eclat, onde]);

  const styleCoche = useAnimatedStyle(() => ({
    transform: [{ scale: coche.value }, { rotate: `${interpolate(coche.value, [0, 1], [-30, 0])}deg` }],
  }));
  const styleOnde = useAnimatedStyle(() => ({
    opacity: interpolate(onde.value, [0, 1], [0.6, 0]),
    transform: [{ scale: interpolate(onde.value, [0, 1], [0.8, 2.4]) }],
  }));

  return (
    <View aria-hidden style={[styles.zone, { width: taille * 2.6, height: taille * 2.6 }]}>
      <Animated.View style={[styles.onde, { width: taille, height: taille, borderRadius: taille / 2 }, styleOnde]} />
      {Array.from({ length: PARTICULES }, (_, i) => (
        <Etincelle key={i} index={i} t={eclat} />
      ))}
      <Animated.View style={[styles.coche, { width: taille, height: taille, borderRadius: taille / 2 }, styleCoche]}>
        <Icone name="check-bold" size={taille * 0.5} color="ink" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: { alignItems: 'center', justifyContent: 'center', marginVertical: -40 },
  onde: { position: 'absolute', borderWidth: 3, borderColor: '#E5545F' },
  etincelle: { position: 'absolute' },
  coche: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5545F',
    shadowColor: '#E5545F',
    shadowOpacity: 0.7,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
});
