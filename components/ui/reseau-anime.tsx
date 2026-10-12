import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';

/**
 * Réseau de bornes traversé par des impulsions d'énergie.
 * Même dessin que le hero de connexion du site (repère 1000 × 1000).
 *
 * Le dessin SVG est statique ; tout ce qui bouge est une vue animée (déplacement, échelle, opacité),
 * seul type d'animation que Reanimated applique à l'identique sur iOS, Android et le web.
 */
const NOEUDS = [
  { x: 640, y: 170 },
  { x: 820, y: 300 },
  { x: 560, y: 380 },
  { x: 900, y: 520 },
  { x: 700, y: 600 },
  { x: 480, y: 640 },
  { x: 820, y: 780 },
  { x: 600, y: 860 },
];
const LIENS: [number, number][] = [
  [0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [2, 5], [3, 4], [3, 6], [4, 5], [4, 6], [5, 7], [6, 7], [4, 7],
];

const ELECTRIQUE = '#E5545F';

/** Point d'énergie qui parcourt un lien d'une borne à l'autre, puis se repose. */
function Impulsion({ lien, delai, duree, echelle }: { lien: [number, number]; delai: number; duree: number; echelle: number }) {
  const [a, b] = lien;
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      delai,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { duration: duree, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 900 }),
        ),
        -1,
        false,
        undefined,
        ReduceMotion.System,
      ),
    );
  }, [t, delai, duree]);

  const x0 = NOEUDS[a].x * echelle;
  const y0 = NOEUDS[a].y * echelle;
  const dx = (NOEUDS[b].x - NOEUDS[a].x) * echelle;
  const dy = (NOEUDS[b].y - NOEUDS[a].y) * echelle;

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.1, 0.85, 1], [0, 1, 1, 0]),
    transform: [{ translateX: x0 + dx * t.value - 4 }, { translateY: y0 + dy * t.value - 4 }],
  }));

  return <Animated.View style={[styles.impulsion, style]} />;
}

/** Onde qui s'élargit autour d'une borne « en charge ». */
function Halo({ x, y, delai, echelle }: { x: number; y: number; delai: number; echelle: number }) {
  const t = useSharedValue(0);
  const taille = 28 * echelle * 2.4;

  useEffect(() => {
    t.value = withDelay(
      delai,
      withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false, undefined, ReduceMotion.System),
    );
  }, [t, delai]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - t.value),
    transform: [{ scale: 0.5 + t.value * 1.4 }],
  }));

  return (
    <Animated.View
      style={[
        styles.halo,
        { width: taille, height: taille, borderRadius: taille / 2, left: x * echelle - taille / 2, top: y * echelle - taille / 2 },
        style,
      ]}
    />
  );
}

export function ReseauAnime({ taille = 420, opacite = 1 }: { taille?: number; opacite?: number }) {
  const reduit = useReducedMotion();
  const echelle = taille / 1000;

  return (
    <View pointerEvents="none" style={[styles.conteneur, { width: taille, height: taille, opacity: opacite }]}>
      <Svg width={taille} height={taille} viewBox="0 0 1000 1000">
        {LIENS.map(([a, b], i) => (
          <Path
            key={`l${i}`}
            d={`M${NOEUDS[a].x} ${NOEUDS[a].y} L${NOEUDS[b].x} ${NOEUDS[b].y}`}
            stroke="rgba(156,176,199,0.28)"
            strokeWidth={2.5}
            fill="none"
          />
        ))}
      </Svg>
      {!reduit &&
        NOEUDS.filter((_, i) => i % 3 === 0).map((n, i) => (
          <Halo key={`h${i}`} x={n.x} y={n.y} delai={600 + i * 700} echelle={echelle} />
        ))}
      {!reduit &&
        LIENS.filter((_, i) => i % 2 === 0).map((lien, i) => (
          <Impulsion key={`i${i}`} lien={lien} delai={400 + i * 350} duree={1800 + ((i * 530) % 1400)} echelle={echelle} />
        ))}
      <Svg width={taille} height={taille} viewBox="0 0 1000 1000" style={StyleSheet.absoluteFill}>
        {NOEUDS.map((n, i) => {
          const actif = i % 3 === 0;
          return (
            <G key={`n${i}`}>
              <Circle cx={n.x} cy={n.y} r={16} fill="#0D0D10" stroke={actif ? ELECTRIQUE : 'rgba(156,176,199,0.5)'} strokeWidth={3} />
              <Circle cx={n.x} cy={n.y} r={6} fill={actif ? ELECTRIQUE : '#A1A1AA'} />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: { position: 'absolute' },
  impulsion: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ELECTRIQUE,
    shadowColor: ELECTRIQUE,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  halo: { position: 'absolute', borderWidth: 2, borderColor: ELECTRIQUE },
});
