import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as DegradeSvg, Path, Rect, Stop } from 'react-native-svg';

import { VoitureElectrique } from '@/components/illustrations/voiture';
import { Icone } from '@/components/ui/icone';

/**
 * Scène de recharge en direct : la borne, le câble et la voiture.
 * Des particules d'énergie circulent dans le câble à une vitesse proportionnelle
 * à la puissance mesurée par la borne ; la trappe s'illumine à chaque arrivée et
 * la jauge de batterie se remplit avec un reflet qui défile.
 *
 * Dessin dans un repère 340 × 196, mis à l'échelle de `largeur`.
 * Animations de vues (transform / opacité) : identiques en natif et sur le web.
 */

export type EtatScene = 'connexion' | 'charge' | 'pause';

const W = 340;
const H = 196;
const SOL = 172;
const LARGEUR_VOITURE = 206;
const K_VOITURE = LARGEUR_VOITURE / 320; // échelle du dessin de VoitureElectrique (320 × 140)
const VOITURE_X = 122;
const VOITURE_Y = SOL - 131 * K_VOITURE;
/** Trappe de recharge de la voiture (60, 86 dans le dessin de la voiture). */
const TRAPPE = { x: VOITURE_X + 60 * K_VOITURE, y: VOITURE_Y + 86 * K_VOITURE };
/** Prise de la borne, puis points de contrôle de la courbe du câble (Bézier cubique). */
const P0 = { x: 74, y: 108 };
const P1 = { x: 104, y: 186 };
const P2 = { x: TRAPPE.x - 34, y: 182 };
const P3 = TRAPPE;
const CABLE = `M${P0.x} ${P0.y} C${P1.x} ${P1.y} ${P2.x} ${P2.y} ${P3.x} ${P3.y}`;

const PARTICULES = 9;
const ROUGE = '#E5545F';
const ROSE = '#F2A3AA';
const AMBRE = '#A1A1AA';

function pointBezier(t: number) {
  'worklet';
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * P0.x + b * P1.x + c * P2.x + d * P3.x,
    y: a * P0.y + b * P1.y + c * P2.y + d * P3.y,
  };
}

/** Particule d'énergie : position sur le câble = phase commune + décalage. */
function Particule({ phase, rang, s, visible }: { phase: SharedValue<number>; rang: number; s: number; visible: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = (phase.value + rang / PARTICULES) % 1;
    const { x, y } = pointBezier(t);
    // Apparition en sortie de borne, disparition dans la trappe.
    const fondu = interpolate(t, [0, 0.08, 0.86, 1], [0, 1, 1, 0]);
    return {
      opacity: fondu * visible.value,
      transform: [{ translateX: (x - 3) * s }, { translateY: (y - 3) * s }, { scale: 0.6 + 0.6 * Math.sin(t * Math.PI) }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.particule, { width: 6 * s, height: 6 * s, borderRadius: 3 * s }, style]} />;
}

type Props = {
  etat: EtatScene;
  /** Puissance mesurée (kW) : règle le débit des particules. */
  puissanceKw?: number | null;
  /** Puissance nominale de la prise (kW), pour normaliser le débit. */
  puissanceMaxKw?: number | null;
  /** Niveau de batterie 0–100, si la borne le transmet. */
  batterie?: number | null;
  largeur?: number;
};

export function SceneRecharge({ etat, puissanceKw, puissanceMaxKw, batterie, largeur = 340 }: Props) {
  const s = largeur / W;
  const reduit = useReducedMotion();

  // Débit : 0,35 tour/s à faible puissance → 1,4 tour/s à pleine puissance.
  const ratio = Math.max(0, Math.min(1, (puissanceKw ?? 0) / Math.max(1, puissanceMaxKw ?? 50)));
  const vitesseCible = etat === 'pause' ? 0 : etat === 'connexion' ? 0.22 : 0.35 + ratio * 1.05;

  const phase = useSharedValue(0);
  const vitesse = useSharedValue(0);
  const visible = useSharedValue(0);
  useEffect(() => {
    vitesse.value = withTiming(reduit ? 0 : vitesseCible, { duration: 900 });
    visible.value = withTiming(etat === 'pause' || reduit ? 0.2 : 1, { duration: 600 });
  }, [vitesseCible, etat, reduit, vitesse, visible]);

  useFrameCallback((frame) => {
    const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
    phase.value = (phase.value + dt * vitesse.value) % 1;
  });

  // Trappe : halo qui pulse au rythme de la charge.
  const halo = useSharedValue(0);
  useEffect(() => {
    if (etat === 'pause' || reduit) {
      halo.value = withTiming(0, { duration: 400 });
      return;
    }
    const periode = etat === 'connexion' ? 1400 : Math.max(520, 1300 - ratio * 700);
    halo.value = withRepeat(
      withSequence(withTiming(1, { duration: periode * 0.35, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: periode * 0.65 })),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [etat, ratio, reduit, halo]);
  const styleHalo = useAnimatedStyle(() => ({
    opacity: 0.25 + halo.value * 0.6,
    transform: [{ scale: 0.8 + halo.value * 0.7 }],
  }));

  // Écran de la borne : l'éclair respire.
  const souffle = useSharedValue(0);
  useEffect(() => {
    souffle.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true, undefined, ReduceMotion.System);
  }, [souffle]);
  const styleEclair = useAnimatedStyle(() => ({ opacity: 0.55 + souffle.value * 0.45, transform: [{ scale: 0.92 + souffle.value * 0.12 }] }));

  // Jauge de batterie : remplissage animé et reflet qui défile pendant la charge.
  const niveau = useSharedValue(0);
  useEffect(() => {
    niveau.value = withTiming(Math.max(0, Math.min(100, batterie ?? 0)) / 100, { duration: 1000, easing: Easing.out(Easing.cubic) });
  }, [batterie, niveau]);
  const reflet = useSharedValue(0);
  useEffect(() => {
    if (etat !== 'charge' || reduit) {
      reflet.value = 0;
      return;
    }
    reflet.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, false, undefined, ReduceMotion.System);
  }, [etat, reduit, reflet]);
  const LARGEUR_JAUGE = 92 * s;
  const styleNiveau = useAnimatedStyle(() => ({ width: Math.max(6 * s, LARGEUR_JAUGE * niveau.value) }));
  const styleReflet = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(reflet.value, [0, 1], [-30 * s, LARGEUR_JAUGE]) }] }));

  const couleur = etat === 'pause' ? AMBRE : ROUGE;

  return (
    <View style={{ width: largeur, height: H * s }} accessible accessibilityLabel={etat === 'pause' ? 'Recharge en pause' : 'Recharge en cours'}>
      {/* Lueur au sol */}
      <LinearGradient
        colors={['transparent', etat === 'pause' ? '#A1A1AA22' : '#E5545F26', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', left: 30 * s, right: 10 * s, top: (SOL - 26) * s, height: 34 * s, borderRadius: 40 * s }}
      />

      <Svg width={largeur} height={H * s} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <DegradeSvg id="corpsBorne" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#2A2A31" />
            <Stop offset="1" stopColor="#141418" />
          </DegradeSvg>
          <DegradeSvg id="gaineCable" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={couleur} stopOpacity={0.9} />
            <Stop offset="1" stopColor={couleur} stopOpacity={0.45} />
          </DegradeSvg>
        </Defs>
        {/* Chaussée */}
        <Rect x={0} y={SOL} width={W} height={2} rx={1} fill="#FFFFFF14" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Rect key={i} x={20 + i * 56} y={SOL + 12} width={26} height={3} rx={1.5} fill="#FFFFFF0D" />
        ))}
        {/* Borne */}
        <Rect x={20} y={48} width={54} height={SOL - 48} rx={12} fill="url(#corpsBorne)" stroke="#FFFFFF1A" strokeWidth={1} />
        <Rect x={30} y={60} width={34} height={26} rx={6} fill="#0B0B0E" stroke="#FFFFFF14" strokeWidth={1} />
        <Rect x={16} y={SOL - 6} width={62} height={6} rx={3} fill="#1E1E24" />
        <Rect x={68} y={P0.y - 7} width={10} height={14} rx={4} fill="#0B0B0E" />
        {/* Câble : gaine sombre + filament lumineux */}
        <Path d={CABLE} stroke="#0B0B0E" strokeWidth={9} strokeLinecap="round" fill="none" />
        <Path d={CABLE} stroke="url(#gaineCable)" strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={etat === 'connexion' ? 0.5 : 1} />
      </Svg>

      {/* Écran de la borne : éclair, LED d'état */}
      <Animated.View style={[styles.eclair, { left: 38 * s, top: 64 * s, width: 18 * s, height: 18 * s }, styleEclair]}>
        <Icone name={etat === 'pause' ? 'pause' : 'lightning-bolt'} size={16 * s} color={couleur} />
      </Animated.View>
      <View style={[styles.led, { left: 44 * s, top: 96 * s, width: 6 * s, height: 6 * s, borderRadius: 3 * s, backgroundColor: couleur, shadowColor: couleur }]} />

      {/* Voiture garée */}
      <View style={{ position: 'absolute', left: VOITURE_X * s, top: VOITURE_Y * s }}>
        <VoitureElectrique largeur={LARGEUR_VOITURE * s} />
      </View>

      {/* Halo de la trappe */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          { left: (TRAPPE.x - 9) * s, top: (TRAPPE.y - 9) * s, width: 18 * s, height: 18 * s, borderRadius: 9 * s, backgroundColor: couleur, shadowColor: couleur },
          styleHalo,
        ]}
      />

      {/* Particules d'énergie */}
      {Array.from({ length: PARTICULES }, (_, i) => (
        <Particule key={i} phase={phase} rang={i} s={s} visible={visible} />
      ))}

      {/* Jauge de batterie au-dessus de la voiture */}
      {batterie != null && (
        <View style={[styles.batterie, { left: (VOITURE_X + 58) * s, top: 18 * s }]}>
          <View style={[styles.cuve, { width: LARGEUR_JAUGE + 8 * s, height: 22 * s, borderRadius: 7 * s, padding: 3 * s }]}>
            <Animated.View style={[{ height: '100%', borderRadius: 4 * s, overflow: 'hidden' }, styleNiveau]}>
              <LinearGradient colors={etat === 'pause' ? [AMBRE, '#D9D9E0'] : [ROUGE, ROSE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
              <Animated.View style={[styles.refletJauge, { width: 26 * s }, styleReflet]}>
                <LinearGradient colors={['#FFFFFF00', '#FFFFFF80', '#FFFFFF00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
              </Animated.View>
            </Animated.View>
          </View>
          <View style={[styles.borneJauge, { width: 4 * s, height: 9 * s, borderRadius: 2 * s }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  particule: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: '#FFE1E6',
    shadowColor: '#E5545F',
    shadowOpacity: 1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  eclair: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  led: { position: 'absolute', shadowOpacity: 1, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  halo: { position: 'absolute', shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  batterie: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 2 },
  cuve: { borderWidth: 1.5, borderColor: '#FFFFFF33', backgroundColor: '#FFFFFF0A' },
  refletJauge: { position: 'absolute', top: 0, bottom: 0 },
  borneJauge: { backgroundColor: '#FFFFFF33' },
});
