import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icone } from '@/components/ui/icone';

const TAILLE = 58;

/** Hauteur de la barre d'onglets flottante (cf. BarreOnglets) au-dessus de laquelle se pose le bouton. */
function hauteurBarre(insetBas: number) {
  return 6 + 62 + Math.max(insetBas - 6, 10);
}

/**
 * Bouton flottant de l'assistant : orbe dégradée de la marque, anneau de charge
 * qui tourne lentement et halo qui respire. Ouvre l'assistant Volta.
 */
export function BoutonAssistant() {
  const insets = useSafeAreaInsets();
  const rotation = useSharedValue(0);
  const souffle = useSharedValue(0);
  const appui = useSharedValue(1);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 6000, easing: Easing.linear }), -1, false, undefined, ReduceMotion.System);
    souffle.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true, undefined, ReduceMotion.System);
  }, [rotation, souffle]);

  const styleAnneau = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const styleHalo = useAnimatedStyle(() => ({ opacity: 0.18 + souffle.value * 0.22, transform: [{ scale: 1.05 + souffle.value * 0.18 }] }));
  const styleBouton = useAnimatedStyle(() => ({ transform: [{ scale: appui.value }] }));

  const ouvrir = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    router.push('/assistant');
  };

  const r = TAILLE / 2 + 5;
  const circonference = 2 * Math.PI * r;

  return (
    <Animated.View
      entering={FadeIn.delay(400).duration(500)}
      pointerEvents="box-none"
      style={[styles.position, { bottom: hauteurBarre(insets.bottom) + 14 }]}>
      <Animated.View pointerEvents="none" style={[styles.halo, styleHalo]} />
      <Animated.View pointerEvents="none" style={[styles.anneau, styleAnneau]}>
        <Svg width={TAILLE + 14} height={TAILLE + 14}>
          <Circle
            cx={(TAILLE + 14) / 2}
            cy={(TAILLE + 14) / 2}
            r={r}
            stroke="#F2A3AA"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={`${circonference * 0.62} ${circonference}`}
            fill="none"
            opacity={0.85}
          />
        </Svg>
      </Animated.View>
      <Animated.View style={styleBouton}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ouvrir Volta, l’assistant"
          onPress={ouvrir}
          onPressIn={() => (appui.value = withSpring(0.9, { damping: 14, stiffness: 400 }))}
          onPressOut={() => (appui.value = withSpring(1, { damping: 10, stiffness: 300 }))}>
          <LinearGradient colors={['#EE7883', '#B83A46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.orbe}>
            <Icone name="robot-happy-outline" size={28} color="#FFFFFF" />
            <View style={styles.etincelle}>
              <Icone name="creation" size={12} color="#FFFFFF" />
            </View>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  position: { position: 'absolute', right: 20, width: TAILLE + 14, height: TAILLE + 14, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: TAILLE, height: TAILLE, borderRadius: TAILLE / 2, backgroundColor: '#E5545F' },
  anneau: { position: 'absolute' },
  orbe: {
    width: TAILLE,
    height: TAILLE,
    borderRadius: TAILLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E5545F',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  etincelle: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#0D0D10',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#F2A3AA',
  },
});
