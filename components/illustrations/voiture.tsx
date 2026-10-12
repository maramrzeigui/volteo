import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/** Repère de dessin de la voiture vue de profil (largeur × hauteur). */
const L = 320;
const H = 140;
const ROUES = [
  { x: 84, y: 108 },
  { x: 240, y: 108 },
];
const RAYON_ROUE = 23;

/** Jante vue de face : pneu, jante et rayons (tourne dans une vue animée). */
function Roue({ taille }: { taille: number }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 50 50">
      <Circle cx={25} cy={25} r={24} fill="#0D0D10" />
      <Circle cx={25} cy={25} r={15} fill="#D7E0EA" />
      <Circle cx={25} cy={25} r={12.5} fill="#AFC0D2" />
      {[0, 72, 144, 216, 288].map((a) => (
        <Rect key={a} x={23.6} y={13} width={2.8} height={12} rx={1.4} fill="#F5F5F7" transform={`rotate(${a} 25 25)`} />
      ))}
      <Circle cx={25} cy={25} r={4} fill="#0D0D10" />
    </Svg>
  );
}

/**
 * Voiture électrique de profil, aux couleurs de la marque.
 * `roule` : roues en rotation et léger rebond de la caisse (animations de vues, natif et web).
 */
export function VoitureElectrique({
  largeur = 260,
  roule = false,
  phares = true,
  rotationRoues,
}: {
  largeur?: number;
  roule?: boolean;
  phares?: boolean;
  /** Angle des roues piloté de l'extérieur (ex. déduit du déplacement de la voiture). */
  rotationRoues?: SharedValue<number>;
}) {
  const k = largeur / L;
  const rotation = useSharedValue(0);
  const rebond = useSharedValue(0);

  useEffect(() => {
    if (!roule) return;
    rotation.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false, undefined, ReduceMotion.System);
    rebond.value = withRepeat(withTiming(1, { duration: 420, easing: Easing.inOut(Easing.sin) }), -1, true, undefined, ReduceMotion.System);
  }, [roule, rotation, rebond]);

  const tourne = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotationRoues ? rotationRoues.value : rotation.value}deg` }],
  }));
  const caisse = useAnimatedStyle(() => ({ transform: [{ translateY: rebond.value * 1.6 }] }));
  const tailleRoue = RAYON_ROUE * 2 * k;

  return (
    <View style={{ width: largeur, height: H * k }}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, caisse]}>
        <Svg width={largeur} height={H * k} viewBox={`0 0 ${L} ${H}`}>
          <Defs>
            <LinearGradient id="carrosserie" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FF5A6E" />
              <Stop offset="0.55" stopColor="#E5545F" />
              <Stop offset="1" stopColor="#B83A46" />
            </LinearGradient>
            <LinearGradient id="vitres" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#2A2A31" />
              <Stop offset="1" stopColor="#0D0D10" />
            </LinearGradient>
            <LinearGradient id="reflet" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.5} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {/* Ombre au sol */}
          <Ellipse cx={162} cy={131} rx={140} ry={7} fill="#0D0D10" opacity={0.16} />
          {/* Carrosserie */}
          <Path
            d="M22 100 C20 84 30 76 48 73 L98 66 C114 46 136 34 168 33 L206 33 C232 34 252 46 270 64 L292 70 C306 74 310 84 309 98 L308 104 C308 110 304 112 298 112 L268 112 C268 92 252 80 240 80 C226 80 212 92 212 112 L112 112 C112 92 98 80 84 80 C70 80 56 92 56 112 L30 112 C24 112 22 108 22 100 Z"
            fill="url(#carrosserie)"
          />
          {/* Vitres */}
          <Path d="M110 66 C124 48 140 41 164 40 L176 40 L176 66 Z" fill="url(#vitres)" />
          <Path d="M184 40 L204 40 C224 41 240 50 254 66 L184 66 Z" fill="url(#vitres)" />
          <Path d="M118 61 C128 50 140 45 156 44 L150 61 Z" fill="#FFFFFF" opacity={0.18} />
          {/* Reflet sur la caisse */}
          <Path d="M60 74 L270 70 L270 74 L60 78 Z" fill="url(#reflet)" opacity={0.7} />
          {/* Portières et poignées */}
          <Path d="M178 68 L178 106" stroke="#B83A46" strokeWidth={1.5} opacity={0.6} />
          <Rect x={150} y={76} width={16} height={3.5} rx={1.75} fill="#FFE4E8" opacity={0.85} />
          <Rect x={196} y={76} width={16} height={3.5} rx={1.75} fill="#FFE4E8" opacity={0.85} />
          {/* Feux */}
          {phares && <Path d="M292 80 C300 80 305 84 306 90 L292 90 Z" fill="#E9FBFF" />}
          {phares && <Path d="M306 85 L319 82 L319 94 L306 90 Z" fill="#E9FBFF" opacity={0.35} />}
          <Path d="M26 84 L36 82 L36 92 L25 93 Z" fill="#FF5B6B" />
          {/* Trappe de recharge */}
          <G>
            <Circle cx={60} cy={86} r={5.5} fill="#0D0D10" />
            <Path d="M61 82.5 L58 87 L60.5 87 L59.5 90 L62.6 85.4 L60 85.4 Z" fill="#E5545F" />
          </G>
          {/* Passages de roue */}
          {ROUES.map((r) => (
            <Circle key={r.x} cx={r.x} cy={r.y} r={RAYON_ROUE + 3} fill="#0D0D10" opacity={0.85} />
          ))}
        </Svg>
      </Animated.View>
      {ROUES.map((r) => (
        <Animated.View
          key={r.x}
          style={[
            { position: 'absolute', left: (r.x - RAYON_ROUE) * k, top: (r.y - RAYON_ROUE) * k, width: tailleRoue, height: tailleRoue },
            tourne,
          ]}>
          <Roue taille={tailleRoue} />
        </Animated.View>
      ))}
    </View>
  );
}

/** Petite voiture vue de dessus, pour les scènes de carte. */
export function VoitureDessus({ taille = 44 }: { taille?: number }) {
  return (
    <Svg width={taille} height={taille * 0.55} viewBox="0 0 80 44">
      <Rect x={2} y={4} width={76} height={36} rx={14} fill="#E5545F" />
      <Rect x={22} y={9} width={20} height={26} rx={6} fill="#0D0D10" />
      <Rect x={48} y={10} width={14} height={24} rx={5} fill="#1E1E24" />
      <Rect x={70} y={10} width={6} height={8} rx={2} fill="#E9FBFF" />
      <Rect x={70} y={26} width={6} height={8} rx={2} fill="#E9FBFF" />
      <Rect x={4} y={10} width={4} height={7} rx={2} fill="#FF5B6B" />
      <Rect x={4} y={27} width={4} height={7} rx={2} fill="#FF5B6B" />
    </Svg>
  );
}
