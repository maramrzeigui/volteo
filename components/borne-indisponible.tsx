import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatHeure } from '@/lib/format';
import type { Borne } from '@/types/domain';

/** États dans lesquels la borne refuse toute recharge (calculés côté serveur). */
export const ETATS_INDISPONIBLES = ['deconnectee', 'indisponible', 'hors_service', 'maintenance', 'defaut'];

export function borneIndisponible(borne: Pick<Borne, 'etat' | 'source'>): boolean {
  return borne.source !== 'publique' && ETATS_INDISPONIBLES.includes(borne.etat);
}

const MESSAGES: Record<string, { icone: NomIcone; titre: string; texte: string }> = {
  deconnectee: {
    icone: 'wifi-off',
    titre: 'Borne hors ligne',
    texte: 'Elle ne communique plus avec notre réseau. La recharge redeviendra possible dès son retour.',
  },
  indisponible: {
    icone: 'power-plug-off-outline',
    titre: 'Borne non disponible',
    texte: 'La borne s’est déclarée indisponible. Choisissez une autre borne à proximité.',
  },
  hors_service: {
    icone: 'cancel',
    titre: 'Borne hors service',
    texte: 'Cette borne a été mise hors service par l’exploitant.',
  },
  maintenance: {
    icone: 'wrench-outline',
    titre: 'Maintenance en cours',
    texte: 'Un technicien intervient sur cette borne. Elle sera bientôt de retour.',
  },
  defaut: {
    icone: 'alert-octagon-outline',
    titre: 'Défaut technique',
    texte: 'La borne signale un défaut. Nos équipes sont prévenues automatiquement.',
  },
};

/**
 * Bandeau expliquant pourquoi la borne ne peut pas recharger, avec une icône
 * qui « cherche le signal » (hors ligne) ou pulse doucement (autres états).
 */
export function BorneIndisponible({ borne }: { borne: Borne }) {
  const { c } = useTheme();
  const info = MESSAGES[borne.etat];
  const signal = useSharedValue(0);

  useEffect(() => {
    signal.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [signal]);
  const styleIcone = useAnimatedStyle(() => ({ opacity: 0.45 + signal.value * 0.55, transform: [{ scale: 0.94 + signal.value * 0.08 }] }));
  const styleOnde = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - signal.value), transform: [{ scale: 1 + signal.value * 0.6 }] }));

  if (!info) return null;
  const depuis = borne.etat === 'deconnectee' && borne.deconnecteeLe ? ` depuis ${formatHeure(borne.deconnecteeLe)}` : '';

  return (
    <View style={[styles.bandeau, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="alert">
      <View style={styles.pastille}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.onde, { backgroundColor: c.warning }, styleOnde]} />
        <Animated.View style={styleIcone}>
          <Icone name={info.icone} size={22} color="warning" />
        </Animated.View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Texte variant="bodyStrong">
          {info.titre}
          {depuis}
        </Texte>
        <Texte variant="caption" color="textMuted">
          {info.texte}
        </Texte>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bandeau: { flexDirection: 'row', alignItems: 'center', gap: Espace.md, padding: Espace.lg, borderRadius: Rayons.lg, borderWidth: 1 },
  pastille: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  onde: { borderRadius: 20 },
});
