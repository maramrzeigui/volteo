import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Point qui émet une onde : signale une donnée en direct. */
export function PointDirect({ couleur, taille = 8 }: { couleur: string; taille?: number }) {
  const onde = useSharedValue(0);

  useEffect(() => {
    onde.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }), -1);
  }, [onde]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - onde.value),
    transform: [{ scale: 1 + onde.value * 2 }],
  }));

  return (
    <View style={{ width: taille, height: taille }}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { borderRadius: taille / 2, backgroundColor: couleur }, style]}
      />
      <View style={[StyleSheet.absoluteFill, { borderRadius: taille / 2, backgroundColor: couleur }]} />
    </View>
  );
}
