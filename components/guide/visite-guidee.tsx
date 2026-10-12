import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Bouton } from '@/components/ui/bouton';
import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import type { Zone } from '@/contexts/guide-context';
import { useTheme } from '@/hooks/use-theme';

const ETAPES: { route: '/' | '/carte' | '/bornes' | '/sessions' | '/profil'; icone: NomIcone; titre: string; texte: string }[] = [
  {
    route: '/',
    icone: 'home-variant',
    titre: 'Votre accueil',
    texte: 'Recharge en cours, état de votre véhicule et dépenses du mois, d’un coup d’œil.',
  },
  {
    route: '/carte',
    icone: 'map',
    titre: 'La carte en direct',
    texte: 'Chaque borne avec sa disponibilité en temps réel. Touchez un repère pour voir les prises et le tarif.',
  },
  {
    route: '/bornes',
    icone: 'ev-station',
    titre: 'Trouver la bonne borne',
    texte: 'Filtrez par disponibilité, charge rapide ou favoris, puis réservez une prise 15 minutes.',
  },
  {
    route: '/sessions',
    icone: 'chart-box',
    titre: 'Votre activité',
    texte: 'Historique des recharges, courbes de puissance et factures PDF.',
  },
  {
    route: '/profil',
    icone: 'account-circle',
    titre: 'Votre compte',
    texte: 'Wallet, abonnement, véhicules et badges RFID. Vous pourrez revoir ce guide ici.',
  },
];

const MARGE = 6; // espace entre l'onglet et le bord du projecteur
const RAYON = 20;

/** Rectangle plein écran percé d'un rectangle arrondi (règle « evenodd »). */
function cheminTrou(l: number, h: number, x: number, y: number, w: number, hh: number, r: number) {
  return (
    `M0 0H${l}V${h}H0Z ` +
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + hh - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + hh}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + hh - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

/** Visite guidée des onglets : projecteur animé + bulle explicative, étape par étape. */
export function VisiteGuidee({ zones, onTerminer }: { zones: Zone[]; onTerminer: () => void }) {
  const { c } = useTheme();
  const { width: l, height: h } = useWindowDimensions();
  const [etape, setEtape] = useState(0);
  const zone = zones[etape] ?? zones[0];
  const derniere = etape === ETAPES.length - 1;

  // Position du projecteur (animée au ressort d'un onglet à l'autre).
  const ressort = { damping: 18, stiffness: 160, reduceMotion: ReduceMotion.System };
  const hx = useSharedValue(zone.x - MARGE);
  const hy = useSharedValue(zone.y - MARGE);
  const hw = useSharedValue(zone.largeur + MARGE * 2);
  const hh = useSharedValue(zone.hauteur + MARGE * 2);

  useEffect(() => {
    hx.value = withSpring(zone.x - MARGE, ressort);
    hy.value = withSpring(zone.y - MARGE, ressort);
    hw.value = withSpring(zone.largeur + MARGE * 2, ressort);
    hh.value = withSpring(zone.hauteur + MARGE * 2, ressort);
    router.navigate(ETAPES[etape].route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape, zone.x, zone.y, zone.largeur, zone.hauteur]);

  // Voile percé : dessin SVG statique par étape, en fondu d'une étape à l'autre
  // (les propriétés SVG animées ne sont pas prises en charge sur le web).
  const voile = cheminTrou(l, h, zone.x - MARGE, zone.y - MARGE, zone.largeur + MARGE * 2, zone.hauteur + MARGE * 2, RAYON);

  // Anneau lumineux qui pulse autour de l'onglet éclairé.
  const pulsation = useSharedValue(0);
  useEffect(() => {
    pulsation.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [pulsation]);
  const anneau = useAnimatedStyle(() => ({
    left: hx.value,
    top: hy.value,
    width: hw.value,
    height: hh.value,
    opacity: 1 - pulsation.value,
    transform: [{ scale: 1 + pulsation.value * 0.18 }],
  }));
  const bord = useAnimatedStyle(() => ({ left: hx.value, top: hy.value, width: hw.value, height: hh.value }));

  // Flèche de la bulle alignée sur le centre de l'onglet.
  const fleche = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.min(Math.max(hx.value + hw.value / 2 - Espace.lg - 10, 14), l - Espace.lg * 2 - 34) }],
  }));

  const suivant = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    if (derniere) onTerminer();
    else setEtape((e) => e + 1);
  };

  const basBulle = h - (zone.y - MARGE) + 18;
  const { icone, titre, texte } = ETAPES[etape];

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      exiting={FadeOut.duration(250)}
      style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}
      accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={suivant} accessibilityLabel="Étape suivante du guide">
        <Animated.View key={etape} entering={FadeIn.duration(320)} exiting={FadeOut.duration(320)} style={StyleSheet.absoluteFill}>
          <Svg width={l} height={h}>
            <Path d={voile} fill="rgba(0,0,0,0.8)" fillRule="evenodd" />
          </Svg>
        </Animated.View>
      </Pressable>

      <Animated.View pointerEvents="none" style={[styles.anneau, anneau]} />
      <Animated.View pointerEvents="none" style={[styles.bord, bord]} />

      <View style={[styles.bulleConteneur, { bottom: basBulle }]} pointerEvents="box-none">
        <Animated.View key={etape} entering={FadeInDown.springify().damping(16)} style={[styles.bulle, { backgroundColor: c.surface }]}>
          <View style={styles.bulleTete}>
            <View style={[styles.iconeEtape, { backgroundColor: c.primarySoft }]}>
              <Icone name={icone} size={22} color="primary" />
            </View>
            <View style={{ flex: 1 }}>
              <Texte variant="label" color="textMuted">
                {`Étape ${etape + 1} sur ${ETAPES.length}`}
              </Texte>
              <Texte variant="heading">{titre}</Texte>
            </View>
          </View>
          <Texte variant="body" color="textMuted">
            {texte}
          </Texte>
          <View style={styles.progression}>
            {ETAPES.map((_, i) => (
              <View
                key={i}
                style={[styles.segment, { backgroundColor: i <= etape ? c.primary : c.surfaceAlt }]}
              />
            ))}
          </View>
          <View style={styles.actions}>
            {!derniere ? (
              <Pressable accessibilityRole="button" onPress={onTerminer} hitSlop={10}>
                <Texte variant="bodyStrong" color="textMuted">
                  Passer
                </Texte>
              </Pressable>
            ) : (
              <View />
            )}
            <Bouton
              titre={derniere ? 'Terminer' : 'Suivant'}
              icone={derniere ? 'check' : 'arrow-right'}
              taille="compact"
              onPress={suivant}
            />
          </View>
        </Animated.View>
        <Animated.View style={[styles.fleche, { borderTopColor: c.surface }, fleche]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anneau: { position: 'absolute', borderRadius: RAYON, borderWidth: 2, borderColor: '#E5545F' },
  bord: {
    position: 'absolute',
    borderRadius: RAYON,
    borderWidth: 1.5,
    borderColor: '#E5545F',
    shadowColor: '#E5545F',
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  bulleConteneur: { position: 'absolute', left: Espace.lg, right: Espace.lg },
  bulle: {
    borderRadius: Rayons.xl,
    padding: Espace.xl,
    gap: Espace.md,
    shadowColor: '#08080A',
    shadowOpacity: 0.35,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
  bulleTete: { flexDirection: 'row', alignItems: 'center', gap: Espace.md },
  iconeEtape: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  progression: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fleche: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
