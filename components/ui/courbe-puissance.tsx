import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { Texte } from '@/components/ui/texte';
import { formatHeure, formatNombre } from '@/lib/format';
import type { Mesure } from '@/types/domain';


type Props = {
  mesures: Mesure[];
  hauteur?: number;
  couleur: string;
  couleurGrille: string;
  couleurTexte: string;
  /** Point final pulsé : pour une recharge en cours. */
  enDirect?: boolean;
};

const MARGE_HAUT = 10;
const MARGE_BAS = 22;

/** Courbe de puissance (kW) dans le temps : aire en dégradé, révélée de gauche à droite. */
export function CourbePuissance({
  mesures,
  hauteur = 170,
  couleur,
  couleurGrille,
  couleurTexte,
  enDirect = false,
}: Props) {
  const [largeur, setLargeur] = useState(0);
  const revele = useSharedValue(0);
  const pulsation = useSharedValue(0);

  const points = mesures.filter((m) => m.puissanceKw != null);

  const { ligne, aire, dernier, max } = useMemo(() => {
    if (points.length < 2 || largeur === 0) return { ligne: '', aire: '', dernier: null, max: 0 };
    const t0 = new Date(points[0].t).getTime();
    const t1 = new Date(points[points.length - 1].t).getTime();
    const maxKw = Math.max(...points.map((p) => p.puissanceKw!)) * 1.15;
    const zone = hauteur - MARGE_HAUT - MARGE_BAS;
    const xy = points.map((p) => [
      ((new Date(p.t).getTime() - t0) / Math.max(1, t1 - t0)) * largeur,
      MARGE_HAUT + zone - (p.puissanceKw! / maxKw) * zone,
    ]);
    // Courbe lissée (Catmull-Rom → Bézier) plutôt qu'une ligne brisée.
    let d = `M${xy[0][0]},${xy[0][1]}`;
    for (let i = 0; i < xy.length - 1; i++) {
      const [x0, y0] = xy[Math.max(0, i - 1)];
      const [x1, y1] = xy[i];
      const [x2, y2] = xy[i + 1];
      const [x3, y3] = xy[Math.min(xy.length - 1, i + 2)];
      d += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`;
    }
    const bas = MARGE_HAUT + zone;
    return {
      ligne: d,
      aire: `${d} L${largeur},${bas} L0,${bas} Z`,
      dernier: xy[xy.length - 1],
      max: maxKw / 1.15,
    };
  }, [points, largeur, hauteur]);

  useEffect(() => {
    if (ligne) {
      revele.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
    }
  }, [ligne, revele]);

  useEffect(() => {
    pulsation.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1);
  }, [pulsation]);

  // Révélation de gauche à droite : une vue dont la largeur s'anime (identique en natif et sur le web).
  const clip = useAnimatedStyle(() => ({ width: largeur * revele.value }));
  const halo = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - pulsation.value),
    transform: [{ scale: 1 + pulsation.value * 1.6 }],
  }));

  return (
    <View onLayout={(e) => setLargeur(e.nativeEvent.layout.width)} style={{ height: hauteur }}>
      {points.length < 2 ? (
        <View style={styles.vide}>
          <Texte variant="caption" color={couleurTexte}>
            La courbe apparaît dès les premières mesures de la borne.
          </Texte>
        </View>
      ) : (
        largeur > 0 && (
          <>
            <Svg width={largeur} height={hauteur}>
              {[0.25, 0.5, 0.75].map((f) => (
                <Line
                  key={f}
                  x1={0}
                  x2={largeur}
                  y1={MARGE_HAUT + (hauteur - MARGE_HAUT - MARGE_BAS) * f}
                  y2={MARGE_HAUT + (hauteur - MARGE_HAUT - MARGE_BAS) * f}
                  stroke={couleurGrille}
                  strokeWidth={1}
                  strokeDasharray="3 5"
                />
              ))}
            </Svg>
            <Animated.View pointerEvents="none" style={[styles.revelation, { height: hauteur }, clip]}>
              <Svg width={largeur} height={hauteur}>
                <Defs>
                  <LinearGradient id="aireCourbe" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={couleur} stopOpacity={0.35} />
                    <Stop offset="1" stopColor={couleur} stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Path d={aire} fill="url(#aireCourbe)" />
                <Path d={ligne} stroke={couleur} strokeWidth={2.5} fill="none" strokeLinecap="round" />
              </Svg>
            </Animated.View>
            {dernier && (
              <View
                pointerEvents="none"
                style={[styles.point, { left: dernier[0] - 5, top: dernier[1] - 5 }]}>
                {enDirect && (
                  <Animated.View style={[styles.halo, { backgroundColor: couleur }, halo]} />
                )}
                <View style={[styles.coeur, { backgroundColor: couleur }]} />
              </View>
            )}
            <View style={styles.axe} pointerEvents="none">
              <Texte variant="caption" color={couleurTexte} style={styles.graduation}>
                {formatHeure(points[0].t)}
              </Texte>
              <Texte variant="caption" color={couleurTexte} style={styles.graduation}>
                pic {formatNombre(max, 0)} kW
              </Texte>
              <Texte variant="caption" color={couleurTexte} style={styles.graduation}>
                {formatHeure(points[points.length - 1].t)}
              </Texte>
            </View>
          </>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  vide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  revelation: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  point: { position: 'absolute', width: 10, height: 10 },
  coeur: { width: 10, height: 10, borderRadius: 5 },
  halo: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  axe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  graduation: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
