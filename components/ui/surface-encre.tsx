import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  /** Reflet lumineux qui balaie la surface de temps en temps (cartes mises en avant). */
  reflet?: boolean;
};

/** Bande de lumière diagonale qui traverse la carte, puis se repose quelques secondes. */
function Reflet({ largeur }: { largeur: number }) {
  const x = useSharedValue(-160);
  useEffect(() => {
    x.value = withRepeat(
      withSequence(
        withTiming(-160, { duration: 0 }),
        withDelay(2600, withTiming(largeur + 160, { duration: 1400, easing: Easing.inOut(Easing.quad) })),
      ),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [x, largeur]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { rotate: '18deg' }] }));

  return (
    <Animated.View pointerEvents="none" style={[styles.reflet, style]}>
      <LinearGradient
        colors={['#FFFFFF00', '#FFFFFF14', '#FFFFFF00']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * Surface bleu nuit signature (en-têtes, carte de recharge, wallet).
 * Un halo vert diffus en haut à droite évoque le courant sans surcharger.
 */
export function SurfaceEncre({ children, style, reflet = false }: Props) {
  const { c } = useTheme();
  const [largeur, setLargeur] = useState(0);

  return (
    <LinearGradient
      colors={[c.inkRaised, c.ink]}
      start={{ x: 1, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.surface, style]}
      onLayout={reflet ? (e) => setLargeur(e.nativeEvent.layout.width) : undefined}>
      <View pointerEvents="none" style={styles.halo}>
        <Svg width={360} height={360}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={c.energy} stopOpacity={0.32} />
              <Stop offset="0.55" stopColor={c.energy} stopOpacity={0.08} />
              <Stop offset="1" stopColor={c.energy} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={180} cy={180} r={180} fill="url(#halo)" />
        </Svg>
      </View>
      {reflet && largeur > 0 && <Reflet largeur={largeur} />}
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  surface: { overflow: 'hidden' },
  halo: { position: 'absolute', top: -190, right: -150 },
  reflet: { position: 'absolute', top: -60, bottom: -60, left: 0, width: 110 },
});
