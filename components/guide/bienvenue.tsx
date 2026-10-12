import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  ReduceMotion,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DISQUE, SceneBrancher, ScenePayer, SceneSuivre, SceneTrouver } from '@/components/illustrations/scenes-guide';
import { Icone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Espace, Polices } from '@/constants/theme';

const TEXTE = '#F5F5F7';
const ROUGE = '#B83A46';
const ROUGE_VIF = '#E5545F';

const ETAPES: { titre: string; texte: string; Scene: ComponentType }[] = [
  {
    titre: 'Trouvez une borne\nprès de vous',
    texte: 'Toutes les bornes de Tunisie sur une carte, avec leur disponibilité en temps réel.',
    Scene: SceneTrouver,
  },
  {
    titre: 'Branchez,\nla charge démarre',
    texte: 'Lancez la recharge depuis l’app, avec votre badge RFID ou le QR code de la borne.',
    Scene: SceneBrancher,
  },
  {
    titre: 'Suivez votre charge\nen direct',
    texte: 'Batterie, puissance et heure de fin estimée, mises à jour pendant toute la recharge.',
    Scene: SceneSuivre,
  },
  {
    titre: 'Payez et reprenez\nla route',
    texte: 'Le montant est débité de votre wallet à l’arrêt. Facture PDF incluse.',
    Scene: ScenePayer,
  },
];

/** Halo rouge qui respire derrière le disque illustré. */
function Halo() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true, undefined, ReduceMotion.System);
  }, [t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.55 + t.value * 0.45, transform: [{ scale: 1 + t.value * 0.05 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.halo, style]}>
      <View style={styles.haloInterieur} />
    </Animated.View>
  );
}

function Diapositive({
  index,
  x,
  largeur,
  etape,
}: {
  index: number;
  x: SharedValue<number>;
  largeur: number;
  etape: (typeof ETAPES)[number];
}) {
  const plage = [(index - 1) * largeur, index * largeur, (index + 1) * largeur];
  // Le titre, le disque et le texte glissent à des vitesses différentes (profondeur).
  const titre = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, plage, [0, 1, 0], 'clamp'),
    transform: [{ translateX: interpolate(x.value, plage, [largeur * 0.3, 0, -largeur * 0.3], 'clamp') }],
  }));
  const visuel = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, plage, [0.2, 1, 0.2], 'clamp'),
    transform: [
      { translateX: interpolate(x.value, plage, [largeur * 0.5, 0, -largeur * 0.5], 'clamp') },
      { scale: interpolate(x.value, plage, [0.75, 1, 0.75], 'clamp') },
      { rotate: `${interpolate(x.value, plage, [8, 0, -8], 'clamp')}deg` },
    ],
  }));
  const texte = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, plage, [0, 1, 0], 'clamp'),
    transform: [{ translateY: interpolate(x.value, plage, [18, 0, 18], 'clamp') }],
  }));
  const { Scene } = etape;

  return (
    <View style={[styles.diapositive, { width: largeur }]} accessibilityLabel={`${etape.titre.replace('\n', ' ')}. ${etape.texte}`}>
      <Animated.View style={titre}>
        {/* Deuxième ligne du titre en rouge, comme les titres du site. */}
        <Texte variant="display" align="center" style={styles.titre}>
          {etape.titre.split('\n')[0]}
          {'\n'}
          <Texte variant="display" style={[styles.titre, { color: ROUGE_VIF }]}>
            {etape.titre.split('\n')[1]}
          </Texte>
        </Texte>
      </Animated.View>
      <Animated.View style={[styles.zoneVisuel, visuel]}>
        <Halo />
        <Scene />
      </Animated.View>
      <Animated.View style={texte}>
        <Texte variant="body" align="center" style={styles.texte}>
          {etape.texte}
        </Texte>
      </Animated.View>
    </View>
  );
}

function Point({ index, x, largeur }: { index: number; x: SharedValue<number>; largeur: number }) {
  const style = useAnimatedStyle(() => {
    const plage = [(index - 1) * largeur, index * largeur, (index + 1) * largeur];
    return {
      width: interpolate(x.value, plage, [8, 32, 8], 'clamp'),
      opacity: interpolate(x.value, plage, [0.3, 1, 0.3], 'clamp'),
    };
  });
  return <Animated.View style={[styles.point, style]} />;
}

/** Guide de bienvenue affiché au premier lancement (et depuis « Revoir le guide »). */
export function Bienvenue({ onTerminer }: { onTerminer: () => void }) {
  const insets = useSafeAreaInsets();
  const { width: largeur } = useWindowDimensions();
  const x = useSharedValue(0);
  const defilement = useRef<Animated.ScrollView>(null);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);

  const surDefilement = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });

  // Page courante déduite de la position (bouton ou glissement au doigt, natif comme web).
  const changerPage = (p: number) => {
    pageRef.current = p;
    setPage(p);
  };
  useAnimatedReaction(
    () => Math.round(x.value / Math.max(largeur, 1)),
    (p, precedente) => {
      if (p !== precedente) runOnJS(changerPage)(p);
    },
    [largeur],
  );

  const derniere = page === ETAPES.length - 1;

  const suivant = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    if (derniere) {
      onTerminer();
      return;
    }
    defilement.current?.scrollTo({ x: (pageRef.current + 1) * largeur, animated: true });
  };

  return (
    <Animated.View
      entering={FadeIn.duration(350)}
      exiting={FadeOut.duration(300)}
      style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
      <StatusBar style="light" />
      <LinearGradient colors={['#1C1C21', '#141418', '#0D0D10']} style={StyleSheet.absoluteFill} />

      <View style={[styles.entete, { paddingTop: insets.top + Espace.sm }]}>
        <View style={styles.pilule}>
          <Icone name="lightning-bolt" size={16} color={TEXTE} />
          <Texte variant="bodyStrong" style={{ color: TEXTE }}>{`Étape ${page + 1}/${ETAPES.length}`}</Texte>
        </View>
        {!derniere && (
          <Pressable accessibilityRole="button" onPress={onTerminer} hitSlop={10} style={styles.pilule}>
            <Texte variant="bodyStrong" style={{ color: ROUGE_VIF }}>
              Passer
            </Texte>
          </Pressable>
        )}
      </View>

      <Animated.ScrollView
        ref={defilement}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={surDefilement}
        scrollEventThrottle={16}
        style={{ flex: 1 }}>
        {ETAPES.map((etape, i) => (
          <Diapositive key={etape.titre} index={i} x={x} largeur={largeur} etape={etape} />
        ))}
      </Animated.ScrollView>

      <View style={[styles.pied, { paddingBottom: insets.bottom + Espace.lg }]}>
        <View style={styles.points}>
          {ETAPES.map((e, i) => (
            <Point key={e.titre} index={i} x={x} largeur={largeur} />
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={suivant}
          style={({ pressed }) => [styles.bouton, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
          <Texte variant="bodyStrong" style={styles.boutonTexte}>
            {derniere ? 'Commencer' : 'Suivant'}
          </Texte>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Espace.xl,
    paddingBottom: Espace.sm,
  },
  pilule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF0D',
    borderWidth: 1,
    borderColor: '#FFFFFF14',
  },
  diapositive: { flex: 1, paddingHorizontal: Espace.xl, paddingTop: Espace.xl, justifyContent: 'space-between' },
  titre: { color: TEXTE, fontFamily: Polices.displayHeavy, fontSize: 32, lineHeight: 38 },
  zoneVisuel: { alignItems: 'center', justifyContent: 'center', height: DISQUE + 60 },
  // Lueur douce rouge en deux couches (aucun flou natif commun à iOS, Android et web).
  halo: {
    position: 'absolute',
    width: DISQUE + 90,
    height: DISQUE + 90,
    borderRadius: (DISQUE + 90) / 2,
    backgroundColor: '#B83A4612',
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloInterieur: {
    width: DISQUE + 40,
    height: DISQUE + 40,
    borderRadius: (DISQUE + 40) / 2,
    backgroundColor: '#B83A461C',
  },
  texte: { color: '#A1A1AA', fontSize: 16, lineHeight: 24, paddingHorizontal: Espace.md, paddingBottom: Espace.md },
  pied: { paddingHorizontal: Espace.xl, gap: Espace.xl },
  points: { flexDirection: 'row', gap: 6, alignSelf: 'center' },
  point: { height: 8, borderRadius: 4, backgroundColor: ROUGE_VIF },
  bouton: {
    height: 62,
    borderRadius: 31,
    backgroundColor: ROUGE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ROUGE,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  boutonTexte: { color: '#FFFFFF', fontSize: 18, lineHeight: 24 },
});
