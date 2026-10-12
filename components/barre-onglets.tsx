import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { useGuide } from '@/contexts/guide-context';
import { useTheme } from '@/hooks/use-theme';

/** Icône qui rebondit quand son onglet devient actif. */
function IconeOnglet({ nom, actif }: { nom: NomIcone; actif: boolean }) {
  const echelle = useSharedValue(1);
  useEffect(() => {
    if (!actif) return;
    echelle.value = withSequence(
      withSpring(1.22, { damping: 8, stiffness: 420, reduceMotion: ReduceMotion.System }),
      withSpring(1, { damping: 12, stiffness: 260, reduceMotion: ReduceMotion.System }),
    );
  }, [actif, echelle]);
  const anime = useAnimatedStyle(() => ({ transform: [{ scale: echelle.value }] }));

  return (
    <Animated.View style={anime}>
      <Icone name={nom} size={22} color={actif ? 'electric' : 'onInkMuted'} />
    </Animated.View>
  );
}

/** Icône pleine pour l'onglet actif, contour sinon. */
const ICONES: Record<string, { actif: NomIcone; inactif: NomIcone }> = {
  index: { actif: 'home-variant', inactif: 'home-variant-outline' },
  carte: { actif: 'map', inactif: 'map-outline' },
  bornes: { actif: 'ev-station', inactif: 'ev-station' },
  sessions: { actif: 'chart-box', inactif: 'chart-box-outline' },
  profil: { actif: 'account-circle', inactif: 'account-circle-outline' },
};

const LARGEUR_PASTILLE = 60;
const HAUTEUR_PASTILLE = 50;

/**
 * Barre d'onglets flottante bleu nuit (identique dans les deux thèmes, c'est la signature) :
 * icône et libellé, pastille électrique qui glisse derrière l'onglet actif.
 */
export function BarreOnglets({ state, descriptors, navigation }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [largeur, setLargeur] = useState(0);
  const { definirZonesOnglets } = useGuide();
  const flottante = useRef<View>(null);

  // Position de chaque onglet à l'écran : utilisée par la visite guidée pour son projecteur.
  const mesurer = () => {
    const enregistrer = (x: number, y: number, w: number) => {
      const n = state.routes.length;
      const cell = (w - PADDING * 2) / n;
      definirZonesOnglets(
        state.routes.map((_, i) => ({ x: x + PADDING + i * cell, y: y + PADDING, largeur: cell, hauteur: HAUTEUR_PASTILLE })),
      );
    };
    const noeud = flottante.current as unknown as { getBoundingClientRect?: () => DOMRect } | null;
    if (Platform.OS === 'web' && noeud?.getBoundingClientRect) {
      // Web : le nœud est un élément du DOM, sa position est lue directement.
      const r = noeud.getBoundingClientRect();
      enregistrer(r.left, r.top, r.width);
    } else {
      flottante.current?.measureInWindow(enregistrer);
    }
  };

  const cellule = largeur / state.routes.length;
  const position = useSharedValue(0);

  const { width: largeurEcran, height: hauteurEcran } = useWindowDimensions();
  useEffect(() => {
    const minuterie = setTimeout(mesurer, 50);
    return () => clearTimeout(minuterie);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [largeurEcran, hauteurEcran]);

  const cellulePrecedente = useRef(0);
  useEffect(() => {
    const cible = state.index * cellule + (cellule - LARGEUR_PASTILLE) / 2;
    // Première mesure : la pastille se place directement, sans glisser depuis le premier onglet.
    position.value = cellulePrecedente.current === 0 ? cible : withSpring(cible, { damping: 20, stiffness: 220 });
    cellulePrecedente.current = cellule;
  }, [state.index, cellule, position]);

  const pastille = useAnimatedStyle(() => ({ transform: [{ translateX: position.value }] }));

  return (
    <View style={[styles.barre, { backgroundColor: c.background, paddingBottom: Math.max(insets.bottom - 6, 10) }]}>
      <View
        ref={flottante}
        style={[styles.flottante, { backgroundColor: c.ink }]}
        onLayout={(e) => {
          setLargeur(e.nativeEvent.layout.width - PADDING * 2);
          setTimeout(mesurer, 0);
        }}>
        {largeur > 0 && <Animated.View style={[styles.pastille, pastille]} />}
        {state.routes.map((route, index) => {
          const actif = state.index === index;
          const titre = descriptors[route.key].options.title ?? route.name;
          const icones = ICONES[route.name];

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={titre}
              accessibilityState={{ selected: actif }}
              style={styles.onglet}
              onPress={() => {
                if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const evenement = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!actif && !evenement.defaultPrevented) navigation.navigate(route.name);
              }}>
              <View style={styles.zoneIcone}>
                {icones && <IconeOnglet nom={actif ? icones.actif : icones.inactif} actif={actif} />}
              </View>
              <Texte variant="captionStrong" color={actif ? 'electric' : 'onInkMuted'} style={styles.libelle}>
                {titre}
              </Texte>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const PADDING = 6;

const styles = StyleSheet.create({
  barre: { paddingTop: 6, paddingHorizontal: 14 },
  flottante: {
    flexDirection: 'row',
    padding: PADDING,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFFFFF1F',
    shadowColor: '#08080A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 12,
  },
  onglet: { flex: 1, alignItems: 'center', justifyContent: 'center', height: HAUTEUR_PASTILLE, gap: 2 },
  zoneIcone: { height: 24, justifyContent: 'center' },
  libelle: { fontSize: 10.5, lineHeight: 13 },
  pastille: {
    position: 'absolute',
    top: PADDING,
    left: PADDING,
    width: LARGEUR_PASTILLE,
    height: HAUTEUR_PASTILLE,
    borderRadius: 20,
    backgroundColor: '#E5545F1F',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5545F4D',
  },
});
