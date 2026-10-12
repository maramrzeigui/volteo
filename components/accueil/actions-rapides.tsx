import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Action = { libelle: string; icone: NomIcone; lien: Href; accent?: boolean };

const ACTIONS: Action[] = [
  { libelle: 'Carte', icone: 'map-marker-radius', lien: '/carte' },
  { libelle: 'Bornes', icone: 'ev-station', lien: '/bornes' },
  { libelle: 'Mon QR', icone: 'qrcode-scan', lien: '/compte/qr' },
  { libelle: 'Volta', icone: 'robot-happy-outline', lien: '/assistant', accent: true },
];

function Tuile({ action, index }: { action: Action; index: number }) {
  const { c } = useTheme();
  const echelle = useSharedValue(1);
  const anime = useAnimatedStyle(() => ({ transform: [{ scale: echelle.value }] }));

  return (
    <Animated.View entering={FadeInDown.delay(150 + index * 70).duration(420)} style={styles.case}>
      <Animated.View style={anime}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.libelle}
          onPressIn={() => (echelle.value = withSpring(0.92, { damping: 15, stiffness: 400 }))}
          onPressOut={() => (echelle.value = withSpring(1, { damping: 10, stiffness: 300 }))}
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.push(action.lien);
          }}
          style={styles.tuile}
        >
          <View
            style={[
              styles.pastille,
              { backgroundColor: action.accent ? c.action : c.surface, borderColor: action.accent ? '#F2A3AA55' : c.border },
            ]}
          >
            <Icone name={action.icone} size={24} color={action.accent ? '#FFFFFF' : c.primary} />
          </View>
          <Texte variant="captionStrong" color="textMuted">
            {action.libelle}
          </Texte>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/** Raccourcis de l'accueil vers les gestes les plus fréquents. */
export function ActionsRapides() {
  return (
    <View style={styles.rangee}>
      {ACTIONS.map((a, i) => (
        <Tuile key={a.libelle} action={a} index={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rangee: { flexDirection: 'row', justifyContent: 'space-between' },
  case: { flex: 1 },
  tuile: { alignItems: 'center', gap: 8 },
  pastille: { width: 58, height: 58, borderRadius: Rayons.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
