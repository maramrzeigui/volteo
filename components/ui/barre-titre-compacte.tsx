import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Texte } from '@/components/ui/texte';
import { useTheme } from '@/hooks/use-theme';

/**
 * Barre de titre compacte qui apparaît quand le grand titre d'une liste sort de l'écran
 * (même comportement que les grands titres iOS).
 */
export function BarreTitreCompacte({ titre, defilement }: { titre: string; defilement: SharedValue<number> }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  const fond = useAnimatedStyle(() => ({ opacity: interpolate(defilement.value, [30, 70], [0, 1], 'clamp') }));
  const texte = useAnimatedStyle(() => ({
    opacity: interpolate(defilement.value, [50, 80], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(defilement.value, [50, 80], [8, 0], 'clamp') }],
  }));

  return (
    <View pointerEvents="none" style={[styles.conteneur, { height: insets.top + 44 }]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: c.background, borderBottomColor: c.border }, styles.fond, fond]}
      />
      <Animated.View style={[styles.titre, { top: insets.top }, texte]}>
        <Texte variant="subheading">{titre}</Texte>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: { position: 'absolute', top: 0, left: 0, right: 0 },
  fond: { borderBottomWidth: StyleSheet.hairlineWidth },
  titre: { position: 'absolute', left: 0, right: 0, height: 44, alignItems: 'center', justifyContent: 'center' },
});
