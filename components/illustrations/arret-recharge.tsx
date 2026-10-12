import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { VoitureElectrique } from '@/components/illustrations/voiture';
import { Icone } from '@/components/ui/icone';

const ROUGE = '#E5545F';
const HAUTEUR = 150;
const LARGEUR_VOITURE = 150;
const K = LARGEUR_VOITURE / 320; // échelle du dessin de la voiture
const DIAMETRE_ROUE = 46 * K;
const ROUTE = 118; // haut de la chaussée
const TROTTOIR = 72; // pied de la borne
const HAUT_VOITURE = ROUTE - 140 * K + 10;
const PRISE_Y = TROTTOIR - 58 + 33; // prise de la borne
const TRAPPE_Y = HAUT_VOITURE + 86 * K; // trappe de recharge de la voiture

/* Cycle complet (ms) : arrivée, recharge, départ, pause. */
const ARRIVEE = 1800;
const RECHARGE = 2600;
const DEPART = 1400;
const PAUSE = 700;

/** Point d'énergie qui descend le câble de la borne vers la trappe de la voiture. */
function Goutte({ x, y0, y1, decalage, charge }: { x: number; y0: number; y1: number; decalage: number; charge: SharedValue<number> }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.linear }), -1, false, undefined, ReduceMotion.System);
  }, [t]);
  const style = useAnimatedStyle(() => {
    const v = (t.value + decalage) % 1;
    const actif = charge.value > 0.02 && charge.value < 0.99 ? 1 : 0;
    return {
      opacity: actif * interpolate(v, [0, 0.15, 0.85, 1], [0, 1, 1, 0]),
      transform: [{ translateX: x - 3 }, { translateY: y0 + (y1 - y0) * v - 3 }],
    };
  });
  return <Animated.View style={[styles.goutte, style]} />;
}

/**
 * Scène de l'écran de connexion : une voiture électrique arrive, s'arrête devant la borne,
 * se recharge (énergie dans le câble, jauge qui se remplit) puis repart. Boucle sans fin.
 * Uniquement des vues animées : rendu identique sur iOS, Android et le web.
 */
export function ArretRecharge() {
  const [largeur, setLargeur] = useState(0);
  const reduit = useReducedMotion();

  const borneX = Math.max(60, largeur * 0.36);
  // La trappe (à l'arrière de la voiture) s'aligne sous la prise de la borne.
  const arret = borneX + 14 - 60 * K;
  const depart = -LARGEUR_VOITURE - 30;
  const sortie = largeur + 30;

  const x = useSharedValue(depart);
  const charge = useSharedValue(0);

  useEffect(() => {
    if (!largeur) return;
    if (reduit) {
      x.value = arret;
      charge.value = 0.7;
      return;
    }
    x.value = depart;
    charge.value = 0;
    x.value = withRepeat(
      withSequence(
        withTiming(depart, { duration: 0 }),
        withTiming(arret, { duration: ARRIVEE, easing: Easing.out(Easing.cubic) }),
        withTiming(arret, { duration: RECHARGE }),
        withTiming(sortie, { duration: DEPART, easing: Easing.in(Easing.cubic) }),
        withTiming(sortie, { duration: PAUSE }),
      ),
      -1,
    );
    charge.value = withRepeat(
      withSequence(
        withTiming(0, { duration: ARRIVEE + 150 }),
        withTiming(1, { duration: RECHARGE - 300, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 150 }),
        withTiming(0, { duration: 120 }),
        withTiming(0, { duration: DEPART + PAUSE - 120 }),
      ),
      -1,
    );
  }, [largeur, reduit, x, charge, arret, depart, sortie]);

  // Les roues tournent exactement selon la distance parcourue : immobiles à l'arrêt.
  const rotation = useDerivedValue(() => ((x.value - depart) / (Math.PI * DIAMETRE_ROUE)) * 360);

  const voiture = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const jauge = useAnimatedStyle(() => ({
    opacity: interpolate(charge.value, [0, 0.05, 0.98, 1], [0, 1, 1, 0.9]),
    transform: [{ translateY: interpolate(charge.value, [0, 0.05], [8, 0], 'clamp') }],
  }));
  const remplissage = useAnimatedStyle(() => ({ width: `${Math.round(18 + charge.value * 82)}%` }));
  const ecran = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * Math.min(1, charge.value * 8) }));
  // Le câble n'apparaît que lorsque la voiture est branchée.
  const branche = useAnimatedStyle(() => ({ opacity: interpolate(charge.value, [0, 0.03], [0, 1], 'clamp') }));
  const traitsRoute = useAnimatedStyle(() => ({
    transform: [{ translateX: -((x.value - depart) % 40) * 0.25 }],
  }));

  return (
    <View
      style={styles.scene}
      onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
      aria-hidden
      pointerEvents="none">
      {largeur > 0 && (
        <>
          {/* Trottoir et chaussée */}
          <View style={[styles.trottoir, { top: TROTTOIR }]} />
          <View style={[styles.route, { top: ROUTE }]}>
            <Animated.View style={[styles.traits, traitsRoute]}>
              {Array.from({ length: Math.ceil(largeur / 40) + 2 }, (_, i) => (
                <View key={i} style={styles.trait} />
              ))}
            </Animated.View>
          </View>

          {/* Borne de recharge */}
          <View style={{ position: 'absolute', left: borneX, top: TROTTOIR - 58 }}>
            <Svg width={30} height={58} viewBox="0 0 30 58">
              <Rect x={1} y={0} width={28} height={56} rx={8} fill="#2A2A31" />
              <Rect x={6} y={6} width={18} height={16} rx={4} fill="#121215" />
              <Path d="M16 9 L11 16 L14.5 16 L13.5 21 L18.5 13.6 L15 13.6 Z" fill={ROUGE} />
              <Rect x={10} y={30} width={10} height={6} rx={2} fill="#121215" />
            </Svg>
            <Animated.View style={[styles.ecranAllume, ecran]} />
          </View>
          {/* Jauge de charge à côté de la borne */}
          <Animated.View style={[styles.jauge, { left: borneX + 40, top: TROTTOIR - 60 }, jauge]}>
            <Icone name="lightning-bolt" size={13} color={ROUGE} />
            <View style={styles.piste}>
              <Animated.View style={[styles.niveau, remplissage]} />
            </View>
          </Animated.View>

          {/* Voiture */}
          <Animated.View style={[{ position: 'absolute', left: 0, top: HAUT_VOITURE }, voiture]}>
            <VoitureElectrique largeur={LARGEUR_VOITURE} rotationRoues={rotation} />
          </Animated.View>
          {/* Câble : de la prise de la borne à la trappe (devant la carrosserie) */}
          <Animated.View
            style={[styles.cable, { left: borneX + 14, top: PRISE_Y, height: TRAPPE_Y - PRISE_Y }, branche]}
          />
          {[0, 0.33, 0.66].map((d) => (
            <Goutte key={d} x={borneX + 15} y0={PRISE_Y} y1={TRAPPE_Y} decalage={d} charge={charge} />
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { height: HAUTEUR, overflow: 'hidden', borderRadius: 18 },
  trottoir: { position: 'absolute', left: 0, right: 0, height: 10, borderRadius: 3, backgroundColor: '#1E1E24' },
  route: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1A1A1F',
    borderTopWidth: 1,
    borderTopColor: '#2E2E36',
    overflow: 'hidden',
  },
  traits: { flexDirection: 'row', gap: 20, marginTop: 9 },
  trait: { width: 20, height: 3, borderRadius: 2, backgroundColor: '#3A3A43' },
  cable: { position: 'absolute', width: 3, borderRadius: 2, backgroundColor: '#4A4A55' },
  goutte: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ROUGE,
    shadowColor: ROUGE,
    shadowOpacity: 1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  ecranAllume: {
    position: 'absolute',
    left: 6,
    top: 6,
    width: 18,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: ROUGE,
    shadowColor: ROUGE,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  jauge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#24242A',
    borderWidth: 1,
    borderColor: '#34343C',
  },
  piste: { width: 46, height: 6, borderRadius: 3, backgroundColor: '#34343C', overflow: 'hidden' },
  niveau: { height: 6, borderRadius: 3, backgroundColor: ROUGE },
});
