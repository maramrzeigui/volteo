import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** `electrique` : action principale posée sur une surface encre (vert lumineux, texte encre). */
type Variante = 'primaire' | 'electrique' | 'secondaire' | 'fantome' | 'danger' | 'surEncre';

type Props = {
  /** Absent pour un bouton icône seule : fournir alors `accessibilityLabel`. */
  titre?: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  variante?: Variante;
  icone?: NomIcone;
  chargement?: boolean;
  desactive?: boolean;
  taille?: 'normal' | 'compact';
  style?: ViewStyle;
};

export function Bouton({
  titre,
  onPress,
  variante = 'primaire',
  icone,
  chargement = false,
  desactive = false,
  taille = 'normal',
  style,
  accessibilityLabel,
}: Props) {
  const { c } = useTheme();

  const apparence = {
    primaire: { fond: c.action, fondPresse: c.actionPressed, texte: c.onPrimary, bord: c.action },
    // Texte blanc sur rouge profond : contraste 5,5:1, plus élégant que du noir sur rouge vif.
    electrique: { fond: c.action, fondPresse: c.actionPressed, texte: c.onPrimary, bord: c.action },
    secondaire: { fond: c.surface, fondPresse: c.surfaceAlt, texte: c.text, bord: c.border },
    fantome: { fond: 'transparent', fondPresse: c.surfaceAlt, texte: c.primary, bord: 'transparent' },
    danger: { fond: c.surface, fondPresse: c.surfaceAlt, texte: c.danger, bord: c.border },
    surEncre: { fond: '#FFFFFF1A', fondPresse: '#FFFFFF2E', texte: c.onInk, bord: '#FFFFFF26' },
  }[variante];

  const inactif = desactive || chargement;
  // Enfoncement « physique » au ressort (même ressenti que les boutons du site).
  const echelle = useSharedValue(1);
  const anime = useAnimatedStyle(() => ({ transform: [{ scale: echelle.value }] }));
  const ressort = { damping: 18, stiffness: 420, mass: 0.6, reduceMotion: ReduceMotion.System };

  return (
    <Animated.View style={[style, anime]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? titre}
        accessibilityState={{ disabled: inactif, busy: chargement }}
        disabled={inactif}
        onPress={() => {
          if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.();
        }}
        onPressIn={() => (echelle.value = withSpring(0.965, ressort))}
        onPressOut={() => (echelle.value = withSpring(1, ressort))}
        style={({ pressed }) => [
          styles.base,
          taille === 'compact' ? styles.compact : styles.normal,
          {
            backgroundColor: pressed ? apparence.fondPresse : apparence.fond,
            borderColor: apparence.bord,
            opacity: desactive ? 0.45 : 1,
          },
        ]}>
        {chargement ? (
          <ActivityIndicator color={apparence.texte} />
        ) : (
          <View style={styles.contenu}>
            {icone && <Icone name={icone} size={taille === 'compact' ? 18 : 20} color={apparence.texte} />}
            {titre ? (
              <Texte variant={taille === 'compact' ? 'captionStrong' : 'bodyStrong'} color={apparence.texte}>
                {titre}
              </Texte>
            ) : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexGrow: 1,
    borderRadius: Rayons.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  normal: { minHeight: 54, paddingHorizontal: 20 },
  compact: { minHeight: 40, paddingHorizontal: 14 },
  contenu: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
