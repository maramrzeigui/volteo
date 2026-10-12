import { useEffect } from 'react';
import { type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Bloc de chargement qui respire, à la forme du contenu attendu. */
export function Squelette({
  largeur = '100%',
  hauteur = 16,
  rayon = Rayons.sm,
}: {
  largeur?: DimensionValue;
  hauteur?: number;
  rayon?: number;
}) {
  const { c } = useTheme();
  const opacite = useSharedValue(0.45);

  useEffect(() => {
    opacite.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [opacite]);

  const style = useAnimatedStyle(() => ({ opacity: opacite.value }));

  return (
    <Animated.View
      style={[{ width: largeur, height: hauteur, borderRadius: rayon, backgroundColor: c.surfaceAlt }, style]}
    />
  );
}
