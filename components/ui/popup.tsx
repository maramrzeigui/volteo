import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** `option` : choix neutre dans une liste (sélection d'une ville…). */
export type BoutonPopup = { libelle: string; valeur: string; style?: 'principal' | 'destructif' | 'annuler' | 'option' };

export type OptionsPopup = {
  titre: string;
  message?: string;
  icone?: NomIcone;
  /** Ton de l'icône : marque (par défaut), danger, ou neutre. */
  ton?: 'marque' | 'danger' | 'neutre';
  boutons?: BoutonPopup[];
  /** Contenu libre sous le message (chiffres, illustration…). */
  contenu?: ReactNode;
  /** Libellé d'en-tête au-dessus du titre (ex. « Le point de Volta »). */
  surtitre?: string;
};

type Demande = OptionsPopup & { id: number; resoudre: (valeur: string | null) => void };

// File d'attente globale : les popups s'enchaînent sans se superposer.
let file: Demande[] = [];
let compteur = 0;
const abonnes = new Set<(f: Demande[]) => void>();
const publier = () => abonnes.forEach((a) => a([...file]));

/** Affiche une popup et renvoie la valeur du bouton choisi (null si fermée). */
export function afficherPopup(options: OptionsPopup): Promise<string | null> {
  return new Promise((resoudre) => {
    file.push({ ...options, id: ++compteur, resoudre });
    publier();
  });
}

function fermer(id: number, valeur: string | null) {
  const d = file.find((x) => x.id === id);
  file = file.filter((x) => x.id !== id);
  publier();
  d?.resoudre(valeur);
}

/** Pastille d'icône avec un halo qui respire. */
function Embleme({ icone, ton }: { icone: NomIcone; ton: NonNullable<OptionsPopup['ton']> }) {
  const { c } = useTheme();
  const couleurs: [string, string] = ton === 'danger' ? ['#EE7883', '#9E2F3A'] : ton === 'neutre' ? ['#3A3A43', '#1E1E24'] : ['#EE7883', '#B83A46'];

  return (
    <View style={styles.embleme}>
      <View style={[styles.emblemeHalo, { backgroundColor: ton === 'neutre' ? c.textFaint : c.primary }]} />
      <LinearGradient colors={couleurs} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emblemeDisque}>
        <Icone name={icone} size={30} color="#FFFFFF" />
      </LinearGradient>
    </View>
  );
}

function BoutonAction({ bouton, onPress, seul }: { bouton: BoutonPopup; onPress: () => void; seul: boolean }) {
  const { c } = useTheme();
  const echelle = useSharedValue(1);
  const anime = useAnimatedStyle(() => ({ transform: [{ scale: echelle.value }] }));
  const style = bouton.style ?? 'principal';

  return (
    <Animated.View style={[{ flex: seul ? undefined : 1 }, anime]}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={() => (echelle.value = withSpring(0.95, { damping: 15, stiffness: 400 }))}
        onPressOut={() => (echelle.value = withSpring(1, { damping: 10, stiffness: 300 }))}
        style={[
          styles.bouton,
          style === 'annuler'
            ? { backgroundColor: 'transparent' }
            : style === 'option'
              ? { backgroundColor: c.surfaceAlt, borderColor: c.border, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between' }
              : { backgroundColor: style === 'destructif' ? '#9E2F3A' : c.action },
        ]}>
        <Texte variant="bodyStrong" color={style === 'annuler' ? 'textMuted' : style === 'option' ? 'text' : '#FFFFFF'}>
          {bouton.libelle}
        </Texte>
        {style === 'option' && <Icone name="chevron-right" size={18} color="primary" />}
      </Pressable>
    </Animated.View>
  );
}

function Carte({ demande }: { demande: Demande }) {
  const { c } = useTheme();
  const entree = useSharedValue(0);
  const boutons = demande.boutons ?? [{ libelle: 'OK', valeur: 'ok' }];
  const annulation = boutons.find((b) => b.style === 'annuler')?.valeur ?? null;

  useEffect(() => {
    // Apparition sobre : simple fondu, sans rebond.
    entree.value = withTiming(1, { duration: 160, reduceMotion: ReduceMotion.System });
    Haptics.notificationAsync(
      demande.ton === 'danger' ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success
    ).catch(() => undefined);
  }, [entree, demande.ton]);

  useEffect(() => {
    const s = BackHandler.addEventListener('hardwareBackPress', () => {
      fermer(demande.id, annulation);
      return true;
    });
    return () => s.remove();
  }, [demande.id, annulation]);

  const anime = useAnimatedStyle(() => ({
    opacity: entree.value,

  }));

  return (
    <Animated.View
      accessibilityViewIsModal
      accessibilityRole="alert"
      style={[styles.carte, { backgroundColor: c.surface, borderColor: c.border }, anime]}>
      {/* Liseré lumineux en tête de carte */}
      <LinearGradient colors={['#E5545F00', '#E5545F', '#E5545F00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.lisere} />
      {demande.icone && <Embleme icone={demande.icone} ton={demande.ton ?? 'marque'} />}
      <View style={styles.textes}>
        {demande.surtitre && (
          <Texte variant="label" color="primary" align="center">
            {demande.surtitre}
          </Texte>
        )}
        <Texte variant="heading" align="center">
          {demande.titre}
        </Texte>
        {demande.message ? (
          <Texte variant="body" color="textMuted" align="center">
            {demande.message}
          </Texte>
        ) : null}
      </View>
      {demande.contenu}
      <View style={[styles.boutons, boutons.length > 2 && { flexDirection: 'column' }]}>
        {boutons.map((b) => (
          <BoutonAction key={b.valeur} bouton={b} seul={boutons.length > 2} onPress={() => fermer(demande.id, b.valeur)} />
        ))}
      </View>
    </Animated.View>
  );
}

/** Hôte des popups, monté une seule fois à la racine de l'application. */
export function HotePopups() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  useEffect(() => {
    abonnes.add(setDemandes);
    return () => {
      abonnes.delete(setDemandes);
    };
  }, []);

  const actuelle = demandes[0];
  if (!actuelle) return null;
  const annulation = actuelle.boutons?.find((b) => b.style === 'annuler')?.valeur ?? null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => fermer(actuelle.id, annulation)}>
      <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={styles.voile}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => fermer(actuelle.id, annulation)} accessibilityLabel="Fermer" />
        <Carte key={actuelle.id} demande={actuelle} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  voile: { flex: 1, backgroundColor: '#050507CC', alignItems: 'center', justifyContent: 'center', padding: Espace.xl },
  carte: {
    width: '100%',
    maxWidth: 380,
    borderRadius: Rayons.xl,
    borderWidth: 1,
    paddingHorizontal: Espace.xl,
    paddingTop: Espace.xxl,
    paddingBottom: Espace.xl,
    gap: Espace.lg,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#E5545F',
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  lisere: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  embleme: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  emblemeHalo: { position: 'absolute', width: 76, height: 76, borderRadius: 38, opacity: 0.2 },
  emblemeDisque: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  textes: { gap: 6, alignSelf: 'stretch' },
  boutons: { flexDirection: 'row', gap: Espace.sm, alignSelf: 'stretch', marginTop: 4 },
  bouton: { height: 50, borderRadius: Rayons.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
});
