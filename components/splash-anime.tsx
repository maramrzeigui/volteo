import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SymboleSeul } from '@/components/ui/symbole-marque';
import Svg, { Circle, Defs, Line, LinearGradient as Degrade, RadialGradient, Stop } from 'react-native-svg';

import { Polices } from '@/constants/theme';

const CercleAnime = Animated.createAnimatedComponent(Circle);
const LigneAnimee = Animated.createAnimatedComponent(Line);

const T = 240; // taille du compteur
const C = T / 2;
const R = 92;
const ARC = 270; // ouverture du cadran, comme un compteur de vitesse
const DEPART = 135; // angle de départ (bas gauche), en degrés SVG
const GRADUATIONS = 36;
const LONGUEUR_ARC = (2 * Math.PI * R * ARC) / 360;
const NOM = 'Volteo'.split('');

const ROUGE = '#E5545F';
const ROSE = '#F2A3AA';

function pointSurCadran(angle: number, rayon: number) {
  const a = (angle * Math.PI) / 180;
  return { x: C + rayon * Math.cos(a), y: C + rayon * Math.sin(a) };
}

/** Graduation du compteur : s'allume quand l'aiguille la dépasse. */
function Graduation({ index, progression }: { index: number; progression: SharedValue<number> }) {
  const seuil = index / (GRADUATIONS - 1);
  const majeure = index % 5 === 0;
  const angle = DEPART + seuil * ARC;
  const a = pointSurCadran(angle, R - 14);
  const b = pointSurCadran(angle, R - (majeure ? 26 : 20));
  const props = useAnimatedProps(() => {
    const allumee = progression.value >= seuil;
    return { strokeOpacity: allumee ? 1 : 0.16, stroke: allumee ? (seuil > 0.8 ? '#FFFFFF' : ROSE) : '#FFFFFF' };
  });
  return <LigneAnimee x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={majeure ? 3 : 1.6} strokeLinecap="round" animatedProps={props} />;
}

/** Traînée lumineuse de feux arrière, comme une photo de nuit en pose longue. */
function Trainee({ y, delai, duree, largeur, epaisseur, ecran }: { y: number; delai: number; duree: number; largeur: number; epaisseur: number; ecran: number }) {
  const x = useSharedValue(-largeur);
  useEffect(() => {
    x.value = withDelay(delai, withTiming(ecran + largeur, { duration: duree, easing: Easing.in(Easing.quad) }));
  }, [x, delai, duree, ecran, largeur]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View style={[{ position: 'absolute', top: y, left: 0, width: largeur, height: epaisseur }, style]}>
      <LinearGradient colors={['#E5545F00', ROUGE, '#FFFFFF']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, { borderRadius: epaisseur }]} />
    </Animated.View>
  );
}

/** Lettre du nom : monte et s'éclaire avec un léger décalage. */
function Lettre({ lettre, index, revele }: { lettre: string; index: number; revele: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, revele.value * (NOM.length + 3) - index));
    return { opacity: p, transform: [{ translateY: (1 - p) * 18 }, { scale: 0.85 + p * 0.15 }] };
  });
  return <Animated.Text style={[styles.lettre, index >= 5 && { color: ROSE }, style]}>{lettre}</Animated.Text>;
}

/**
 * Écran de lancement : tableau de bord d'une voiture électrique la nuit.
 * Des traînées de phares traversent l'écran, l'aiguille du compteur grimpe pendant
 * que la batterie se charge, l'éclair s'allume avec une onde de choc, le nom se
 * révèle lettre par lettre, puis la caméra plonge dans le logo vers l'application.
 */
export function SplashAnime({ onFin }: { onFin: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduit = useReducedMotion();

  const apparition = useSharedValue(0);
  const charge = useSharedValue(0);
  const eclair = useSharedValue(0);
  const onde = useSharedValue(0);
  const nom = useSharedValue(0);
  const plongee = useSharedValue(0);
  const [pourcent, setPourcent] = useState(0);

  useAnimatedReaction(
    () => Math.min(100, Math.round(charge.value * 100)),
    (v, avant) => {
      if (v !== avant) runOnJS(setPourcent)(v);
    }
  );

  useEffect(() => {
    const finir = () => onFin();
    if (reduit) {
      apparition.value = 1;
      charge.value = 1;
      eclair.value = 1;
      nom.value = 1;
      plongee.value = withDelay(800, withTiming(1, { duration: 300 }, (ok) => ok && runOnJS(finir)()));
      return;
    }
    const vibrer = (fort: boolean) =>
      Haptics.impactAsync(fort ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    apparition.value = withDelay(250, withSpring(1, { damping: 14, stiffness: 120 }));
    // L'aiguille accélère, dépasse légèrement puis se cale : comme un vrai compteur.
    charge.value = withDelay(
      500,
      withSequence(
        withTiming(1.03, { duration: 1100, easing: Easing.bezier(0.5, 0, 0.2, 1) }),
        withSpring(1, { damping: 12, stiffness: 180 }, (ok) => ok && runOnJS(vibrer)(true))
      )
    );
    eclair.value = withDelay(1600, withTiming(1, { duration: 260, easing: Easing.out(Easing.exp) }));
    onde.value = withDelay(1620, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    nom.value = withDelay(1750, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    plongee.value = withDelay(2850, withTiming(1, { duration: 520, easing: Easing.in(Easing.cubic) }, (ok) => ok && runOnJS(finir)()));
  }, [reduit, apparition, charge, eclair, onde, nom, plongee, onFin]);

  const propsArc = useAnimatedProps(() => ({
    strokeDashoffset: LONGUEUR_ARC * (1 - Math.min(1, charge.value)),
  }));
  const styleAiguille = useAnimatedStyle(() => ({
    transform: [{ rotate: `${DEPART + 90 + Math.min(1.03, charge.value) * ARC}deg` }],
  }));
  const styleCadran = useAnimatedStyle(() => ({
    opacity: apparition.value,
    transform: [{ scale: interpolate(apparition.value, [0, 1], [0.7, 1]) * (1 + plongee.value * 7) }],
  }));
  const styleEclair = useAnimatedStyle(() => ({
    opacity: 0.25 + eclair.value * 0.75,
    transform: [{ scale: 0.8 + eclair.value * 0.2 + Math.sin(eclair.value * Math.PI) * 0.25 }],
  }));
  const styleFlash = useAnimatedStyle(() => ({ opacity: Math.sin(eclair.value * Math.PI) * 0.12 }));
  const styleOnde1 = useAnimatedStyle(() => ({ opacity: (1 - onde.value) * 0.8 * (onde.value > 0 ? 1 : 0), transform: [{ scale: 0.6 + onde.value * 2.2 }] }));
  const styleOnde2 = useAnimatedStyle(() => {
    const p = Math.max(0, onde.value * 1.4 - 0.4);
    return { opacity: (1 - p) * 0.5 * (p > 0 ? 1 : 0), transform: [{ scale: 0.6 + p * 3 }] };
  });
  const styleHalo = useAnimatedStyle(() => ({ opacity: 0.15 + Math.min(1, charge.value) * 0.5 + eclair.value * 0.2 }));
  const styleTexte = useAnimatedStyle(() => ({ opacity: 1 - plongee.value * 2, transform: [{ translateY: plongee.value * 40 }] }));
  const styleSlogan = useAnimatedStyle(() => ({ opacity: Math.max(0, nom.value * 1.6 - 0.6) }));
  const styleFond = useAnimatedStyle(() => ({ opacity: 1 - Math.max(0, plongee.value * 1.6 - 0.6) }));
  const styleChiffre = useAnimatedStyle(() => ({ opacity: apparition.value * (1 - eclair.value) }));

  const trainees = [
    { y: height * 0.18, delai: 0, duree: 700, largeur: 260, epaisseur: 2 },
    { y: height * 0.24, delai: 120, duree: 560, largeur: 340, epaisseur: 3 },
    { y: height * 0.72, delai: 60, duree: 620, largeur: 300, epaisseur: 2.5 },
    { y: height * 0.8, delai: 260, duree: 520, largeur: 380, epaisseur: 3.5 },
    { y: height * 0.86, delai: 420, duree: 700, largeur: 220, epaisseur: 1.5 },
    { y: height * 0.12, delai: 520, duree: 600, largeur: 200, epaisseur: 1.5 },
  ];

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.fond, styleFond]} pointerEvents="none" aria-hidden>
      {!reduit && trainees.map((t, i) => <Trainee key={i} {...t} ecran={width} />)}

      <View style={styles.centre}>
        <Animated.View style={[styles.cadran, styleCadran]}>
          <Animated.View style={[styles.halo, styleHalo]}>
            <Svg width={T * 1.8} height={T * 1.8}>
              <Defs>
                <RadialGradient id="splash-halo">
                  <Stop offset="0" stopColor={ROUGE} stopOpacity={0.55} />
                  <Stop offset="1" stopColor={ROUGE} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={T * 0.9} cy={T * 0.9} r={T * 0.9} fill="url(#splash-halo)" />
            </Svg>
          </Animated.View>

          <Animated.View style={[styles.onde, styleOnde1]} />
          <Animated.View style={[styles.onde, styleOnde2]} />

          <Svg width={T} height={T}>
            <Defs>
              <Degrade id="splash-arc" x1="0" y1="1" x2="1" y2="0">
                <Stop offset="0" stopColor="#B83A46" />
                <Stop offset="0.6" stopColor={ROUGE} />
                <Stop offset="1" stopColor={ROSE} />
              </Degrade>
            </Defs>
            {/* Piste du cadran */}
            <Circle
              cx={C}
              cy={C}
              r={R}
              stroke="#FFFFFF"
              strokeOpacity={0.07}
              strokeWidth={8}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${LONGUEUR_ARC} 1000`}
              transform={`rotate(${DEPART} ${C} ${C})`}
            />
            <CercleAnime
              cx={C}
              cy={C}
              r={R}
              stroke="url(#splash-arc)"
              strokeWidth={8}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${LONGUEUR_ARC} 1000`}
              animatedProps={propsArc}
              transform={`rotate(${DEPART} ${C} ${C})`}
            />
            {Array.from({ length: GRADUATIONS }, (_, i) => (
              <Graduation key={i} index={i} progression={charge} />
            ))}
          </Svg>

          {/* Aiguille */}
          <Animated.View style={[styles.aiguilleAxe, styleAiguille]}>
            <LinearGradient colors={['#FFFFFF', ROUGE]} style={styles.aiguille} />
          </Animated.View>

          {/* Éclair central */}
          <Animated.View style={[styles.eclair, styleEclair]}>
            <SymboleSeul taille={64} id="splash" />
          </Animated.View>
          <View style={styles.moyeu} />

          <Animated.View style={[styles.chiffre, styleChiffre]}>
            <Text style={styles.chiffreTexte}>{pourcent}</Text>
            <Text style={styles.chiffreUnite}>% charge</Text>
          </Animated.View>
        </Animated.View>

        <Animated.View style={[styles.nom, styleTexte]}>
          <View style={styles.lettres}>
            {NOM.map((l, i) => (
              <Lettre key={i} lettre={l} index={i} revele={nom} />
            ))}
          </View>
          <Animated.Text style={[styles.slogan, styleSlogan]}>RECHARGEZ · ROULEZ · REPARTEZ</Animated.Text>
        </Animated.View>
      </View>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, styleFlash]} />
    </Animated.View>
  );
}

/** Joue le splash animé une seule fois par lancement. */
export function useSplashAnime() {
  const [visible, setVisible] = useState(true);
  const terminer = useCallback(() => {
    setVisible(false);
  }, []);
  return { visible, terminer };
}

const styles = StyleSheet.create({
  fond: { backgroundColor: '#0D0D10', zIndex: 1000, elevation: 1000, overflow: 'hidden' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 26 },
  cadran: { width: T, height: T, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', left: -T * 0.4, top: -T * 0.4 },
  onde: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: ROSE },
  aiguilleAxe: { position: 'absolute', width: 4, height: R * 2 - 24, alignItems: 'center' },
  aiguille: { width: 4, height: R - 30, borderRadius: 2, shadowColor: ROUGE, shadowOpacity: 1, shadowRadius: 8 },
  moyeu: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#0D0D10', borderWidth: 2, borderColor: ROSE },
  eclair: { position: 'absolute', top: C - 78, shadowColor: ROUGE, shadowOpacity: 0.9, shadowRadius: 18 },
  chiffre: { position: 'absolute', bottom: 18, alignItems: 'center' },
  chiffreTexte: { fontFamily: Polices.displayHeavy, fontSize: 26, color: '#F5F5F7', fontVariant: ['tabular-nums'] },
  chiffreUnite: { fontFamily: Polices.bodyBold, fontSize: 10, letterSpacing: 1.5, color: '#A1A1AA', textTransform: 'uppercase' },
  nom: { alignItems: 'center', gap: 10 },
  lettres: { flexDirection: 'row' },
  lettre: { fontFamily: Polices.displayHeavy, fontSize: 40, letterSpacing: -0.8, color: '#F5F5F7' },
  slogan: { fontFamily: Polices.bodyBold, fontSize: 11, letterSpacing: 2.4, color: '#A1A1AA' },
  flash: { backgroundColor: ROUGE },
});
