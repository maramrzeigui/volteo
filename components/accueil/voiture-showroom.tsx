import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient as Degrade,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

const RectAnime = Animated.createAnimatedComponent(Rect);
const CheminAnime = Animated.createAnimatedComponent(Path);

/** Repère de dessin (profil d'une berline électrique moderne). */
const L = 360;
const H = 150;
const SOL = 128;
const ROUES = [82, 278];
const R_PNEU = 26;

const CARROSSERIE =
  'M24 112 C18 106 17 96 19 90 C20 82 25 78 33 75 L52 70 C72 57 96 44 122 38 C138 35 152 34 168 34 L212 34 C234 35 254 45 274 59 L286 66 C310 68 330 71 342 75 C351 79 354 88 353 98 L351 108 C350 111 348 112 344 112 L308 112 A30 30 0 0 0 248 112 L112 112 A30 30 0 0 0 52 112 Z';
const VITRES = 'M82 66 C102 51 126 43 152 40 L210 39 C230 41 248 50 268 64 L268 66 L82 67 Z';

/** Jante aérodynamique : pneu, flanc, jante à 5 doubles branches et étrier rouge. */
function Roue({ taille }: { taille: number }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 60 60">
      <Defs>
        <RadialGradient id="flanc" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0.72" stopColor="#1A1A1F" />
          <Stop offset="0.9" stopColor="#0A0A0C" />
          <Stop offset="1" stopColor="#24242A" />
        </RadialGradient>
        <Degrade id="jante" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E9EAEE" />
          <Stop offset="0.5" stopColor="#8E9099" />
          <Stop offset="1" stopColor="#3A3B42" />
        </Degrade>
      </Defs>
      <Circle cx={30} cy={30} r={30} fill="url(#flanc)" />
      <Circle cx={30} cy={30} r={20.5} fill="#121216" />
      {/* Étrier de frein */}
      <Path d="M14 22 A17 17 0 0 1 24 13.5 L26 17 A13 13 0 0 0 18 24 Z" fill="#E11D3C" />
      {[0, 72, 144, 216, 288].map((a) => (
        <G key={a} transform={`rotate(${a} 30 30)`}>
          <Path d="M28.6 11 L31.4 11 L31 27 L29 27 Z" fill="url(#jante)" />
          <Path d="M32.6 11.4 L34.6 12.2 L31.6 27.4 L30.6 27 Z" fill="url(#jante)" opacity={0.8} />
        </G>
      ))}
      <Circle cx={30} cy={30} r={20.5} fill="none" stroke="url(#jante)" strokeWidth={2.4} />
      <Circle cx={30} cy={30} r={5} fill="#1A1A1F" stroke="#C9CBD2" strokeWidth={1.2} />
      <Path d="M30.8 27.4 L28.8 30.4 L30.2 30.4 L29.4 32.8 L31.4 29.8 L30 29.8 Z" fill="#E5545F" />
    </Svg>
  );
}

/** Caisse vue de profil ; `reflet` pilote le reflet lumineux qui balaie la carrosserie. */
function Caisse({ largeur, reflet, id }: { largeur: number; reflet?: SharedValue<number>; id: string }) {
  const props = useAnimatedProps(() => ({ x: reflet ? -80 + reflet.value * (L + 160) : -400 }));
  return (
    <Svg width={largeur} height={(largeur * H) / L} viewBox={`0 0 ${L} ${H}`}>
      <Defs>
        <Degrade id={`${id}-peinture`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF6F81" />
          <Stop offset="0.28" stopColor="#E5545F" />
          <Stop offset="0.62" stopColor="#C4122B" />
          <Stop offset="1" stopColor="#6E0816" />
        </Degrade>
        <Degrade id={`${id}-vitres`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3B3E4A" />
          <Stop offset="0.45" stopColor="#15161B" />
          <Stop offset="1" stopColor="#0A0A0D" />
        </Degrade>
        <Degrade id={`${id}-bas`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.45} />
        </Degrade>
        <Degrade id={`${id}-eclat`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </Degrade>
        <ClipPath id={`${id}-forme`}>
          <Path d={CARROSSERIE} />
        </ClipPath>
      </Defs>

      <Path d={CARROSSERIE} fill={`url(#${id}-peinture)`} />
      {/* Bas de caisse plus sombre et ligne de caractère */}
      <Path d="M30 96 L350 94 L352 108 L22 112 Z" fill={`url(#${id}-bas)`} />
      <Path d="M40 84 C120 80 240 78 342 80" stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={1.2} fill="none" />
      {/* Vitres, montant central, jonc chromé */}
      <Path d={VITRES} fill={`url(#${id}-vitres)`} />
      <Path d="M100 60 C114 51 128 46 146 43 L140 60 Z" fill="#FFFFFF" opacity={0.12} />
      <Rect x={164} y={39} width={6} height={28} fill="#0A0A0D" />
      <Path d="M82 67 L268 66" stroke="#D9DBE2" strokeOpacity={0.7} strokeWidth={1.4} />
      {/* Rétroviseur */}
      <Path d="M266 61 C270 55 280 55 282 59 L280 65 L268 65 Z" fill="#A3343F" />
      {/* Portières et poignées affleurantes */}
      <Path d="M167 70 L166 108 M108 70 C106 84 105 98 106 108" stroke="#5A0613" strokeWidth={1.2} fill="none" opacity={0.8} />
      <Rect x={136} y={74} width={18} height={3} rx={1.5} fill="#FFFFFF" opacity={0.55} />
      <Rect x={200} y={74} width={18} height={3} rx={1.5} fill="#FFFFFF" opacity={0.55} />
      {/* Optiques : bandeau LED avant, feu arrière filant */}
      <Path d="M326 72 C336 73 346 75 351 79 L348 81 C340 78 332 76 324 75 Z" fill="#F4FBFF" />
      <Path d="M18 84 C22 80 28 77 38 75 L38 78 C30 80 24 82 20 86 Z" fill="#FF2A45" />
      {/* Trappe de recharge */}
      <Circle cx={60} cy={82} r={4.5} fill="#0A0A0D" stroke="#F2A3AA" strokeWidth={0.8} />
      {/* Reflet qui balaie la carrosserie */}
      <G clipPath={`url(#${id}-forme)`}>
        <RectAnime y={0} width={60} height={H} fill={`url(#${id}-eclat)`} animatedProps={props} transform="skewX(-20)" />
      </G>
      {/* Passages de roue */}
      {ROUES.map((x) => (
        <Circle key={x} cx={x} cy={112} r={29} fill="#08080A" />
      ))}
    </Svg>
  );
}

/**
 * Voiture du client à la borne : elle arrive et freine, fait un appel de phares
 * (comme au déverrouillage), se gare près de la borne, le câble se déroule jusqu'à
 * la trappe et l'énergie circule pendant que l'écran affiche la batterie.
 * Un reflet balaie la carrosserie, l'éclairage du dessous respire selon la batterie
 * et la trappe de recharge pulse.
 */
export function VoitureShowroom({ largeur: largeurScene = 320, batterie }: { largeur?: number; batterie?: number | null }) {
  // La borne occupe la gauche de la scène, la voiture se gare à sa droite.
  const largeur = largeurScene * 0.78;
  const gauche = largeurScene - largeur;
  const k = largeur / L;
  const hauteur = H * k;
  const reduit = useReducedMotion();

  const x = useSharedValue(reduit ? 0 : largeur * 0.9);
  const phares = useSharedValue(0);
  const reflet = useSharedValue(0);
  const souffle = useSharedValue(0);
  const tangage = useSharedValue(0);
  const cable = useSharedValue(reduit ? 1 : 0);
  const flux = useSharedValue(0);

  useEffect(() => {
    if (reduit) return;
    x.value = withTiming(0, { duration: 1400, easing: Easing.bezier(0.15, 0.8, 0.25, 1) });
    // Léger plongeon au freinage.
    tangage.value = withDelay(900, withSequence(withTiming(1, { duration: 220 }), withTiming(0, { duration: 420, easing: Easing.out(Easing.back(3)) })));
    phares.value = withDelay(
      1550,
      withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(0.15, { duration: 160 }),
        withTiming(1, { duration: 90 }),
        withTiming(0.4, { duration: 700 })
      )
    );
    reflet.value = withDelay(1800, withRepeat(withSequence(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) }), withTiming(1, { duration: 2600 }), withTiming(0, { duration: 0 })), -1, false, undefined, ReduceMotion.System));
    souffle.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true, undefined, ReduceMotion.System);
    // Le câble se déroule jusqu'à la trappe, puis l'énergie circule en continu.
    cable.value = withDelay(2300, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
    flux.value = withDelay(3200, withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false, undefined, ReduceMotion.System));
  }, [reduit, x, phares, reflet, souffle, tangage, cable, flux]);

  const rotation = useDerivedValue(() => (-x.value / (Math.PI * 2 * R_PNEU * k)) * 360);
  const styleVoiture = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { rotate: `${tangage.value * 0.8}deg` }] }));
  const styleRoue = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const styleFaisceau = useAnimatedStyle(() => ({ opacity: phares.value }));
  const styleDessous = useAnimatedStyle(() => ({ opacity: 0.35 + souffle.value * 0.4, transform: [{ scaleX: 0.9 + souffle.value * 0.1 }] }));
  const styleTrappe = useAnimatedStyle(() => ({ opacity: 0.3 + souffle.value * 0.7, transform: [{ scale: 0.8 + souffle.value * 0.6 }] }));
  const styleProjecteur = useAnimatedStyle(() => ({ opacity: 0.6 + souffle.value * 0.25 }));

  const niveau = Math.max(0, Math.min(100, batterie ?? 60));
  const tailleRoue = R_PNEU * 2 * k;

  // Borne de recharge et câble jusqu'à la trappe (côté arrière gauche de la voiture).
  const sol = (SOL - 2) * k + 6;
  const bw = Math.max(34, gauche * 0.5);
  const bh = hauteur * 0.92;
  const bx = gauche * 0.22;
  const by = sol - bh;
  const prise = { x: bx + bw, y: by + bh * 0.52 };
  const trappe = { x: gauche + 60 * k, y: 6 + 82 * k };
  const traceCable = `M${prise.x} ${prise.y} C${prise.x + 26} ${prise.y + 4}, ${prise.x + 8} ${sol - 4}, ${(prise.x + trappe.x) / 2} ${sol - 6} S${trappe.x - 6} ${trappe.y + 22}, ${trappe.x} ${trappe.y}`;
  const longueurCable = Math.hypot(trappe.x - prise.x, trappe.y - prise.y) * 1.9 + (sol - prise.y);
  const propsCable = useAnimatedProps(() => ({ strokeDashoffset: longueurCable * (1 - cable.value) }));
  const propsFlux = useAnimatedProps(() => ({ strokeDashoffset: -flux.value * 32, strokeOpacity: cable.value >= 1 ? 1 : 0 }));
  const styleLed = useAnimatedStyle(() => ({ opacity: 0.45 + souffle.value * 0.55 }));
  const styleEcran = useAnimatedStyle(() => ({ opacity: cable.value }));

  const voiture = (reflet?: SharedValue<number>, id = 'v') => (
    <View style={{ width: largeur, height: hauteur }}>
      <Caisse largeur={largeur} reflet={reflet} id={id} />
      {ROUES.map((rx) => (
        <Animated.View key={rx} style={[{ position: 'absolute', left: (rx - R_PNEU) * k, top: (112 - R_PNEU) * k + 2 * k, width: tailleRoue, height: tailleRoue }, styleRoue]}>
          <Roue taille={tailleRoue} />
        </Animated.View>
      ))}
    </View>
  );

  return (
    <View style={[styles.scene, { width: largeurScene, height: hauteur * 1.45 }]} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Projecteur du showroom */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styleProjecteur]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="projecteur" cx="0.5" cy="0.45" rx="0.5" ry="0.5">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.14} />
              <Stop offset="0.6" stopColor="#E5545F" stopOpacity={0.05} />
              <Stop offset="1" stopColor="#E5545F" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#projecteur)" />
        </Svg>
      </Animated.View>

      {/* Sol brillant */}
      <LinearGradient
        colors={['#FFFFFF00', '#FFFFFF14', '#FFFFFF00']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.horizon, { top: (SOL - 2) * k + 6 }]}
      />

      {/* Borne de recharge */}
      <View style={[styles.borne, { left: bx, top: by, width: bw, height: bh }]}>
        <LinearGradient colors={['#3A3A42', '#22222A', '#17171C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: 8 }]} />
        <Animated.View style={[styles.ledBorne, styleLed]} />
        <View style={[styles.ecranBorne, { marginTop: bh * 0.14 }]}>
          <Animated.View style={[styles.ecranContenu, styleEcran]}>
            <Text style={styles.ecranEclair}>⚡</Text>
            <Text style={[styles.ecranTexte, { fontSize: Math.max(9, bw * 0.24) }]}>{niveau}%</Text>
          </Animated.View>
        </View>
        <View style={[styles.socle, { width: bw * 0.42, height: bw * 0.42, marginTop: bh * 0.08 }]} />
      </View>
      <View style={[styles.ombre, { left: bx - 6, width: bw + 12, top: sol - 4, height: 8 }]} />

      <Animated.View style={[{ position: 'absolute', top: 6, left: gauche }, styleVoiture]}>
        {/* Éclairage du dessous, dont l'intensité suit le niveau de batterie */}
        <Animated.View style={[styles.dessous, { left: 40 * k, width: 280 * k, top: (SOL - 12) * k, opacity: 0.4 + niveau / 250 }, styleDessous]}>
          <Svg width="100%" height={24 * k}>
            <Defs>
              <RadialGradient id="dessous" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
                <Stop offset="0" stopColor="#E5545F" stopOpacity={0.85} />
                <Stop offset="1" stopColor="#E5545F" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill="url(#dessous)" />
          </Svg>
        </Animated.View>

        {/* Ombre de contact */}
        <View style={[styles.ombre, { left: 30 * k, width: 300 * k, top: (SOL - 6) * k, height: 10 * k }]} />

        {/* Faisceau des phares : halo doux devant le bandeau LED */}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 320 * k, top: 46 * k }, styleFaisceau]}>
          <Svg width={130 * k} height={64 * k}>
            <Defs>
              <RadialGradient id="faisceau" cx="0.15" cy="0.5" rx="0.85" ry="0.5">
                <Stop offset="0" stopColor="#F4FBFF" stopOpacity={0.9} />
                <Stop offset="0.35" stopColor="#F4FBFF" stopOpacity={0.25} />
                <Stop offset="1" stopColor="#F4FBFF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={65 * k} cy={32 * k} rx={65 * k} ry={32 * k} fill="url(#faisceau)" />
          </Svg>
        </Animated.View>

        {voiture(reflet, 'v')}

        {/* Pulsation de la trappe de recharge */}
        <Animated.View style={[styles.trappe, { left: 60 * k - 6, top: 82 * k - 6 }, styleTrappe]} />

        {/* Reflet au sol, inversé et estompé */}
        <View style={{ transform: [{ scaleY: -1 }], opacity: 0.16, marginTop: -6 * k }} pointerEvents="none">
          {voiture(undefined, 'm')}
        </View>
        <LinearGradient
          pointerEvents="none"
          colors={['#14141800', '#141418']}
          style={{ position: 'absolute', left: 0, width: largeur, top: hauteur - 6 * k, height: hauteur * 0.5 }}
        />
      </Animated.View>

      {/* Câble de recharge et énergie qui circule vers la voiture */}
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={largeurScene} height={hauteur * 1.45}>
        <CheminAnime d={traceCable} stroke="#0A0A0C" strokeWidth={5} strokeLinecap="round" fill="none" strokeDasharray={`${longueurCable} ${longueurCable}`} animatedProps={propsCable} />
        <CheminAnime d={traceCable} stroke="#2E2E36" strokeWidth={2} strokeLinecap="round" fill="none" strokeDasharray={`${longueurCable} ${longueurCable}`} animatedProps={propsCable} />
        <CheminAnime d={traceCable} stroke="#F2A3AA" strokeWidth={2.4} strokeLinecap="round" fill="none" strokeDasharray="5 11" animatedProps={propsFlux} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { overflow: 'hidden', marginHorizontal: -8 },
  borne: { position: 'absolute', alignItems: 'center', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF22' },
  ledBorne: { position: 'absolute', top: 0, left: 6, right: 6, height: 3, borderRadius: 2, backgroundColor: '#E5545F', shadowColor: '#E5545F', shadowOpacity: 1, shadowRadius: 6 },
  ecranBorne: { width: '72%', aspectRatio: 0.9, borderRadius: 4, backgroundColor: '#0A0A0D', borderWidth: 1, borderColor: '#FFFFFF1A', alignItems: 'center', justifyContent: 'center' },
  ecranContenu: { alignItems: 'center' },
  ecranEclair: { fontSize: 10, color: '#F2A3AA' },
  ecranTexte: { color: '#F5F5F7', fontFamily: 'Outfit_700Bold', fontVariant: ['tabular-nums'] },
  socle: { borderRadius: 999, backgroundColor: '#0A0A0D', borderWidth: 1.5, borderColor: '#E5545F88' },
  horizon: { position: 'absolute', left: 0, right: 0, height: 1 },
  dessous: { position: 'absolute' },
  ombre: { position: 'absolute', borderRadius: 999, backgroundColor: '#000000', opacity: 0.55 },
  trappe: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#F2A3AA', shadowColor: '#E5545F', shadowOpacity: 1, shadowRadius: 6 },
});
