import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { VoitureDessus, VoitureElectrique } from '@/components/illustrations/voiture';
import { AnneauCharge } from '@/components/ui/anneau-charge';
import { Icone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';

/**
 * Scènes illustrées du guide de bienvenue, dans un disque de 280 px.
 * Toutes les animations sont des transformations de vues : identiques sur iOS, Android et le web.
 */
export const DISQUE = 280;
const ROUGE_VIF = '#E5545F';
const ROUGE = '#B83A46';
const ENCRE = '#0D0D10';
const BOUCLE = { reduceMotion: ReduceMotion.System } as const;

/** Valeur 0 → 1 qui boucle indéfiniment. */
function useBoucle(duree: number, { delai = 0, allerRetour = false, easing = Easing.linear } = {}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delai, withRepeat(withTiming(1, { duration: duree, easing, ...BOUCLE }), -1, allerRetour, undefined, ReduceMotion.System));
    // Démarrée une seule fois : les re-rendus (ex. jauge qui monte) ne relancent pas la boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  return t;
}

/** Disque de la scène : fond dégradé, découpe ronde, liseré lumineux. */
function Disque({ couleurs, children }: { couleurs: [string, string]; children: ReactNode }) {
  return (
    <View style={styles.disque}>
      <LinearGradient colors={couleurs} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

/** Pastille flottante (info clé) qui ondule doucement. */
function Pastille({ icone, texte, style, delai = 0 }: { icone: Parameters<typeof Icone>[0]['name']; texte: string; style: object; delai?: number }) {
  const t = useBoucle(1800, { delai, allerRetour: true, easing: Easing.inOut(Easing.sin) });
  const anime = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(t.value, [0, 1], [-4, 4]) }] }));
  return (
    <Animated.View style={[styles.pastille, style, anime]}>
      <Icone name={icone} size={15} color={ROUGE} />
      <Texte variant="captionStrong" style={{ fontSize: 12 }}>
        {texte}
      </Texte>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Trouver : carte vue du ciel, bornes et voiture qui circule       */
/* ------------------------------------------------------------------ */

function Repere({ x, y, delai, couleur = ROUGE }: { x: number; y: number; delai: number; couleur?: string }) {
  const t = useBoucle(1600, { delai, allerRetour: true, easing: Easing.inOut(Easing.quad) });
  const saut = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(t.value, [0, 1], [0, -7]) }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: x - 17, top: y - 44 }, saut]}>
      <Svg width={34} height={44} viewBox="0 0 34 44">
        <Path d="M17 43 C17 43 2 27 2 17 C2 8.7 8.7 2 17 2 C25.3 2 32 8.7 32 17 C32 27 17 43 17 43 Z" fill={couleur} />
        <Circle cx={17} cy={17} r={10} fill="#FFFFFF" />
        <Path d="M18.4 10 L12.5 19 L16.6 19 L15.6 24.5 L21.5 15.6 L17.4 15.6 Z" fill={couleur} />
      </Svg>
    </Animated.View>
  );
}

function OndePosition() {
  const t = useBoucle(2000, { easing: Easing.out(Easing.quad) });
  const onde = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - t.value), transform: [{ scale: 0.4 + t.value * 1.6 }] }));
  return (
    <View style={{ position: 'absolute', left: 140 - 30, top: 150 - 30, width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.onde, onde]} />
      <View style={styles.position} />
    </View>
  );
}

export function SceneTrouver() {
  const t = useBoucle(5200);
  const voiture = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(t.value, [0, 1], [-60, DISQUE + 20]) }] }));
  return (
    <Disque couleurs={['#26262C', '#18181C']}>
      <Svg width={DISQUE} height={DISQUE} style={StyleSheet.absoluteFill}>
        {/* Îlots et parcs */}
        <Rect x={20} y={30} width={95} height={80} rx={14} fill="#2A2A31" />
        <Rect x={170} y={36} width={90} height={70} rx={14} fill="#232329" />
        <Rect x={30} y={190} width={80} height={70} rx={14} fill="#232329" />
        <Rect x={168} y={188} width={96} height={72} rx={14} fill="#2A2A31" />
        <Circle cx={212} cy={70} r={14} fill="#3A1C22" />
        <Circle cx={66} cy={222} r={16} fill="#3A1C22" />
        {/* Routes */}
        <Rect x={0} y={132} width={DISQUE} height={34} fill="#34343C" />
        <Rect x={128} y={0} width={30} height={DISQUE} fill="#34343C" />
        {[10, 50, 90, 190, 230].map((x) => (
          <Rect key={x} x={x} y={148} width={20} height={3} rx={1.5} fill="#4A4A55" />
        ))}
      </Svg>
      <Animated.View style={[{ position: 'absolute', top: 137 }, voiture]}>
        <VoitureDessus taille={46} />
      </Animated.View>
      <OndePosition />
      <Repere x={70} y={120} delai={0} />
      <Repere x={214} y={122} delai={400} />
      <Repere x={196} y={236} delai={800} couleur="#F2A3AA" />
      <Pastille icone="map-marker-radius" texte="1,2 km" style={{ left: 58, top: 206 }} delai={300} />
    </Disque>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Brancher : borne, câble sous tension, voiture en charge          */
/* ------------------------------------------------------------------ */

/** Point d'énergie qui suit le câble (polyligne) de la borne vers la voiture. */
function Energie({ t, points, decalage }: { t: SharedValue<number>; points: [number, number][]; decalage: number }) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const pas = points.map((_, i) => i / (points.length - 1));
  const style = useAnimatedStyle(() => {
    const v = (t.value + decalage) % 1;
    return {
      opacity: interpolate(v, [0, 0.1, 0.9, 1], [0, 1, 1, 0]),
      transform: [{ translateX: interpolate(v, pas, xs) - 4 }, { translateY: interpolate(v, pas, ys) - 4 }],
    };
  });
  return <Animated.View style={[styles.energie, style]} />;
}

export function SceneBrancher() {
  const t = useBoucle(1400);
  const eclair = useBoucle(900, { allerRetour: true, easing: Easing.inOut(Easing.quad) });
  const badge = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(eclair.value, [0, 1], [0.92, 1.08]) }] }));
  // Câble : de la prise de la borne (x 62, y 150) jusqu'à la trappe de la voiture (x 129, y 190).
  const cable: [number, number][] = [
    [62, 150],
    [70, 192],
    [96, 208],
    [118, 202],
    [129, 190],
  ];
  return (
    <Disque couleurs={['#26262C', '#18181C']}>
      {/* Sol */}
      <View style={styles.sol} />
      <Svg width={DISQUE} height={DISQUE} style={StyleSheet.absoluteFill}>
        {/* Borne */}
        <Rect x={30} y={84} width={44} height={128} rx={12} fill="#2E2E36" />
        <Rect x={38} y={96} width={28} height={34} rx={6} fill="#1E1E24" />
        <Path d="M53 102 L45 115 L51 115 L49 124 L57 111 L51 111 Z" fill={ROUGE_VIF} />
        <Rect x={44} y={142} width={16} height={10} rx={3} fill="#1E1E24" />
        <Rect x={26} y={208} width={52} height={8} rx={4} fill="#1E1E24" />
        {/* Câble */}
        <Path d="M62 150 C66 188 78 208 96 208 C114 208 124 200 129 190" stroke="#4A4A55" strokeWidth={5} fill="none" strokeLinecap="round" />
      </Svg>
      <View style={{ position: 'absolute', left: 92, top: 136 }}>
        <VoitureElectrique largeur={200} />
      </View>
      {[0, 0.33, 0.66].map((d) => (
        <Energie key={d} t={t} points={cable} decalage={d} />
      ))}
      <Animated.View style={[styles.badgeEclair, badge]}>
        <Icone name="lightning-bolt" size={26} color={ENCRE} />
      </Animated.View>
      <Pastille icone="battery-charging-70" texte="72 %" style={{ right: 34, top: 58 }} delai={200} />
    </Disque>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Suivre : la charge en direct sur le téléphone                    */
/* ------------------------------------------------------------------ */

export function SceneSuivre() {
  const [valeur, setValeur] = useState(28);
  useEffect(() => {
    const minuterie = setInterval(() => setValeur((v) => (v >= 88 ? 28 : v + 6)), 900);
    return () => clearInterval(minuterie);
  }, []);
  const t = useBoucle(2400, { allerRetour: true, easing: Easing.inOut(Easing.sin) });
  const telephone = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(t.value, [0, 1], [-5, 5]) }, { rotate: '-4deg' }] }));

  return (
    <Disque couleurs={['#26262C', '#18181C']}>
      <View style={styles.solBas} />
      <View style={{ position: 'absolute', left: 30, top: 196, opacity: 0.9 }}>
        <VoitureElectrique largeur={150} phares={false} />
      </View>
      <Animated.View style={[styles.telephone, telephone]}>
        <View style={styles.encoche} />
        <Texte variant="label" color="onInkMuted" style={{ fontSize: 9 }}>
          En charge
        </Texte>
        <AnneauCharge valeur={valeur} taille={104} epaisseur={10} couleurDebut={ROUGE_VIF} couleurFin="#F2A3AA" couleurPiste="#FFFFFF14" flux>
          <Texte variant="heading" color="onInk">
            {`${valeur}%`}
          </Texte>
        </AnneauCharge>
        <View style={styles.ligneTel}>
          <Texte variant="captionStrong" color="#F2A3AA" style={{ fontSize: 11 }}>
            54 kW
          </Texte>
          <Texte variant="caption" color="onInkMuted" style={{ fontSize: 11 }}>
            · 18 min
          </Texte>
        </View>
      </Animated.View>
      <Pastille icone="clock-outline" texte="Fin 14:32" style={{ left: 18, top: 70 }} delai={0} />
      <Pastille icone="flash" texte="+42 km" style={{ right: 16, top: 150 }} delai={500} />
    </Disque>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Payer : la voiture repart, le reçu est validé                    */
/* ------------------------------------------------------------------ */

function TraitVitesse({ y, largeur, delai }: { y: number; largeur: number; delai: number }) {
  const t = useBoucle(700, { delai });
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.2, 1], [0, 0.8, 0]),
    transform: [{ translateX: interpolate(t.value, [0, 1], [30, -60]) }],
  }));
  return <Animated.View style={[styles.trait, { top: y, width: largeur }, style]} />;
}

export function ScenePayer() {
  const route = useBoucle(600);
  const tirets = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(route.value, [0, 1], [0, -40]) }] }));
  const coche = useSharedValue(0);
  useEffect(() => {
    coche.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withDelay(500, withSpring(1, { damping: 9, stiffness: 170 })),
        withTiming(1, { duration: 1800 }),
      ),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [coche]);
  const styleCoche = useAnimatedStyle(() => ({ opacity: coche.value, transform: [{ scale: interpolate(coche.value, [0, 1], [0.3, 1]) }] }));
  const flotte = useBoucle(2000, { allerRetour: true, easing: Easing.inOut(Easing.sin) });
  const recu = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(flotte.value, [0, 1], [-4, 4]) }, { rotate: '6deg' }] }));

  return (
    <Disque couleurs={['#26262C', '#18181C']}>
      <View style={styles.route}>
        <Animated.View style={[styles.tirets, tirets]}>
          {Array.from({ length: 10 }, (_, i) => (
            <View key={i} style={styles.tiret} />
          ))}
        </Animated.View>
      </View>
      <TraitVitesse y={178} largeur={46} delai={0} />
      <TraitVitesse y={196} largeur={30} delai={250} />
      <TraitVitesse y={160} largeur={24} delai={450} />
      <View style={{ position: 'absolute', left: 50, top: 146 }}>
        <VoitureElectrique largeur={190} roule />
      </View>
      <Animated.View style={[styles.recu, recu]}>
        <View style={styles.recuTete}>
          <Icone name="wallet-outline" size={16} color="copper" />
          <Texte variant="captionStrong" color="textMuted" style={{ fontSize: 11 }}>
            Wallet
          </Texte>
        </View>
        <Texte variant="heading" color="copper">
          12,40 DT
        </Texte>
        <View style={styles.recuLigne} />
        <View style={[styles.recuLigne, { width: '60%' }]} />
        <Animated.View style={[styles.coche, styleCoche]}>
          <Icone name="check-bold" size={18} color="#FFFFFF" />
        </Animated.View>
      </Animated.View>
    </Disque>
  );
}

const styles = StyleSheet.create({
  disque: {
    width: DISQUE,
    height: DISQUE,
    borderRadius: DISQUE / 2,
    overflow: 'hidden',
    borderWidth: 6,
    borderColor: '#FFFFFF1A',
  },
  pastille: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#24242A',
    borderWidth: 1,
    borderColor: '#34343C',
    shadowColor: ENCRE,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  onde: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: '#F5F5F7' },
  position: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#F5F5F7', borderWidth: 3, borderColor: '#FFFFFF' },
  sol: { position: 'absolute', left: 0, right: 0, top: 216, bottom: 0, backgroundColor: '#1E1E24' },
  solBas: { position: 'absolute', left: 0, right: 0, top: 252, bottom: 0, backgroundColor: '#1E1E24' },
  energie: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ROUGE_VIF,
    shadowColor: ROUGE_VIF,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  badgeEclair: {
    position: 'absolute',
    left: 162,
    top: 100,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: ROUGE_VIF,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#121215',
    shadowColor: ROUGE_VIF,
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  telephone: {
    position: 'absolute',
    left: 90,
    top: 40,
    width: 128,
    height: 196,
    borderRadius: 24,
    backgroundColor: ENCRE,
    borderWidth: 4,
    borderColor: '#1E1E24',
    alignItems: 'center',
    paddingTop: 18,
    gap: 6,
    shadowColor: ENCRE,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  encoche: { position: 'absolute', top: 7, width: 34, height: 6, borderRadius: 3, backgroundColor: '#1E1E24' },
  ligneTel: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  route: { position: 'absolute', left: 0, right: 0, top: 222, height: 58, backgroundColor: '#1E1E24', overflow: 'hidden' },
  tirets: { flexDirection: 'row', gap: 20, marginTop: 26, width: DISQUE + 80 },
  tiret: { width: 20, height: 4, borderRadius: 2, backgroundColor: '#F5F5F7', opacity: 0.5 },
  trait: { position: 'absolute', left: 30, height: 3, borderRadius: 2, backgroundColor: ROUGE },
  recu: {
    position: 'absolute',
    right: 30,
    top: 44,
    width: 112,
    padding: 12,
    gap: 6,
    borderRadius: 16,
    backgroundColor: '#24242A',
    borderWidth: 1,
    borderColor: '#34343C',
    shadowColor: ENCRE,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  recuTete: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  recuLigne: { height: 5, borderRadius: 3, backgroundColor: '#3A3A43', width: '85%' },
  coche: {
    position: 'absolute',
    right: -10,
    top: -10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ROUGE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#24242A',
  },
});
