import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

/** Surface blanche (ou bleu nuit en thème sombre) à bord fin et ombre douce. */
const RESSORT = { damping: 16, stiffness: 380, mass: 0.7, reduceMotion: ReduceMotion.System };

export function Carte({ children, onPress, style, accessibilityLabel }: Props) {
  const { c } = useTheme();
  // Carte cliquable : elle s'enfonce au ressort sous le doigt.
  const echelle = useSharedValue(1);
  const anime = useAnimatedStyle(() => ({ transform: [{ scale: echelle.value }] }));

  const base = [
    styles.carte,
    {
      backgroundColor: c.surface,
      borderColor: c.border,
      shadowOpacity: 0.35,
    },
    style,
  ];

  if (!onPress) return <View style={base}>{children}</View>;

  return (
    <Animated.View style={anime}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onPressIn={() => (echelle.value = withSpring(0.975, RESSORT))}
        onPressOut={() => (echelle.value = withSpring(1, RESSORT))}
        style={({ pressed }) => [...base, pressed && { opacity: 0.94 }]}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  carte: {
    borderRadius: Rayons.lg,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 2,
  },
});
