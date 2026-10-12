import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icone } from '@/components/ui/icone';

/**
 * Avatar de l'assistant : pastille dégradée de la marque. Pendant la réflexion,
 * elle respire et s'entoure d'un halo électrique (même principe que l'assistant Tuntrust).
 */
export function AvatarIA({ reflechit = false, taille = 44 }: { reflechit?: boolean; taille?: number }) {
  const pouls = useSharedValue(0);

  useEffect(() => {
    if (reflechit) {
      pouls.value = withRepeat(withTiming(1, { duration: 650, easing: Easing.inOut(Easing.sin) }), -1, true, undefined, ReduceMotion.System);
    } else {
      cancelAnimation(pouls);
      pouls.value = withTiming(0, { duration: 250 });
    }
  }, [reflechit, pouls]);

  const styleAvatar = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pouls.value * 0.12 }] }));
  const styleHalo = useAnimatedStyle(() => ({
    opacity: pouls.value * 0.55,
    transform: [{ scale: 1 + pouls.value * 0.45 }],
  }));

  return (
    <View style={{ width: taille, height: taille }}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.halo, { borderRadius: taille / 2 }, styleHalo]} />
      <Animated.View style={[StyleSheet.absoluteFill, styleAvatar]}>
        <LinearGradient
          colors={['#EE7883', '#B83A46']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.centre, { borderRadius: taille / 2 }]}>
          <Icone name="robot-happy-outline" size={taille * 0.52} color="#FFFFFF" />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { backgroundColor: '#E5545F' },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
