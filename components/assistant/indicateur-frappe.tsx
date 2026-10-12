import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Point qui rebondit, décalé dans le temps de ses voisins. */
function Point({ rang }: { rang: number }) {
  const saut = useSharedValue(0);
  useEffect(() => {
    saut.value = withDelay(
      rang * 150,
      withRepeat(withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) }), -1, true, undefined, ReduceMotion.System),
    );
  }, [rang, saut]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -7 * saut.value }], opacity: 0.55 + saut.value * 0.45 }));

  return <Animated.View style={[styles.point, style]} />;
}

/** L'assistant rédige sa réponse : trois points qui rebondissent dans une bulle. */
export function IndicateurFrappe() {
  const { c } = useTheme();

  return (
    <View
      accessibilityLabel="L’assistant rédige sa réponse"
      style={[styles.bulle, { backgroundColor: c.surface, borderColor: c.border }]}>
      {[0, 1, 2].map((i) => (
        <Point key={i} rang={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bulle: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderRadius: Rayons.lg,
    borderBottomLeftRadius: 6,
  },
  point: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E5545F' },
});
