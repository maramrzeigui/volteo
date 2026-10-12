import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const CercleAnime = Animated.createAnimatedComponent(Circle);

type Props = {
  /** Pourcentage 0–100. */
  valeur: number;
  taille?: number;
  epaisseur?: number;
  couleurDebut: string;
  couleurFin: string;
  couleurPiste: string;
  /** Flux d'énergie en rotation : pour une recharge en cours. */
  flux?: boolean;
  children?: ReactNode;
};

/** Jauge circulaire de charge, remplissage animé à chaque nouvelle valeur. */
export function AnneauCharge({
  valeur,
  taille = 196,
  epaisseur = 14,
  couleurDebut,
  couleurFin,
  couleurPiste,
  flux = false,
  children,
}: Props) {
  const rayon = (taille - epaisseur) / 2;
  const circonference = 2 * Math.PI * rayon;
  const progression = useSharedValue(0);

  useEffect(() => {
    progression.value = withTiming(Math.max(0, Math.min(100, valeur)) / 100, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [valeur, progression]);

  const proprietes = useAnimatedProps(() => ({
    strokeDashoffset: circonference * (1 - progression.value),
  }));

  // Web : Reanimated n'anime pas les propriétés SVG ; une transition CSS fait le même remplissage.
  const [valeurWeb, setValeurWeb] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const image = requestAnimationFrame(() => setValeurWeb(Math.max(0, Math.min(100, valeur)) / 100));
    return () => cancelAnimationFrame(image);
  }, [valeur]);

  const rotation = useSharedValue(0);
  useEffect(() => {
    if (flux) {
      rotation.value = withRepeat(withTiming(360, { duration: 3200, easing: Easing.linear }), -1);
    }
  }, [flux, rotation]);
  const tourne = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const rayonFlux = rayon - epaisseur - 6;

  return (
    <View style={{ width: taille, height: taille }}>
      <Svg width={taille} height={taille}>
        <Defs>
          <LinearGradient id="degradeCharge" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={couleurDebut} />
            <Stop offset="1" stopColor={couleurFin} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={taille / 2}
          cy={taille / 2}
          r={rayon}
          stroke={couleurPiste}
          strokeWidth={epaisseur}
          fill="none"
        />
        {Platform.OS === 'web' ? (
          <Circle
            cx={taille / 2}
            cy={taille / 2}
            r={rayon}
            stroke="url(#degradeCharge)"
            strokeWidth={epaisseur}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circonference}
            transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
            // @ts-expect-error style CSS transmis au <circle> du DOM par react-native-svg (web)
            style={{
              strokeDashoffset: circonference * (1 - valeurWeb),
              transition: 'stroke-dashoffset 900ms cubic-bezier(0.33, 1, 0.68, 1)',
            }}
          />
        ) : (
          <CercleAnime
            cx={taille / 2}
            cy={taille / 2}
            r={rayon}
            stroke="url(#degradeCharge)"
            strokeWidth={epaisseur}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circonference}
            animatedProps={proprietes}
            transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
          />
        )}
      </Svg>
      {flux && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, tourne]}>
          <Svg width={taille} height={taille}>
            <Circle
              cx={taille / 2}
              cy={taille / 2}
              r={rayonFlux}
              stroke={couleurFin}
              strokeOpacity={0.55}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={`${rayonFlux * 0.35} ${rayonFlux * 0.9}`}
              fill="none"
            />
          </Svg>
        </Animated.View>
      )}
      <View style={[StyleSheet.absoluteFill, styles.centre]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
});
