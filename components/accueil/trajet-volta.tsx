import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AvatarIA } from '@/components/assistant/avatar-ia';
import { VoitureDessus } from '@/components/illustrations/voiture';
import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { formatDuree, formatNombre } from '@/lib/format';
import type { EtapeTrajet, TrajetVolta as Trajet, VilleTrajet } from '@/types/domain';

/** Animation d'attente : la voiture parcourt la route pendant que Volta calcule. */
export function CalculEnCours() {
  const { c } = useTheme();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) }), -1, false, undefined, ReduceMotion.System);
  }, [p]);
  const voiture = useAnimatedStyle(() => ({ left: `${p.value * 82}%` }));
  const trace = useAnimatedStyle(() => ({ width: `${p.value * 88}%` }));

  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.calcul}>
      <View style={[styles.piste, { backgroundColor: c.surfaceAlt }]}>
        <Animated.View style={[styles.trace, trace]}>
          <LinearGradient colors={['#E5545F00', '#E5545F']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={[styles.voiturePiste, voiture]}>
          <VoitureDessus taille={34} />
        </Animated.View>
      </View>
      <Texte variant="caption" color="textMuted" align="center">
        Volta prépare votre trajet…
      </Texte>
    </Animated.View>
  );
}

function Resume({ icone, valeur, libelle }: { icone: NomIcone; valeur: string; libelle: string }) {
  return (
    <View style={styles.resume}>
      <Icone name={icone} size={16} color="primary" />
      <Texte variant="subheading" style={styles.tabulaire}>
        {valeur}
      </Texte>
      <Texte variant="label" color="textFaint">
        {libelle}
      </Texte>
    </View>
  );
}

/** Jauge de batterie miniature : niveau d'arrivée → niveau de départ. */
function MiniBatterie({ de, a }: { de: number; a?: number }) {
  const { c } = useTheme();
  return (
    <View style={[styles.miniBatterie, { backgroundColor: c.surfaceAlt }]}>
      {a != null && <View style={[styles.miniNiveau, { width: `${a}%`, backgroundColor: '#F2A3AA55' }]} />}
      <View style={[styles.miniNiveau, { width: `${de}%`, backgroundColor: de < 20 ? '#9E2F3A' : c.primary }]} />
    </View>
  );
}

function Etape({
  etape,
  index,
  derniere,
  numeroArret,
  onRetirer,
}: {
  etape: EtapeTrajet;
  index: number;
  derniere: boolean;
  numeroArret: number;
  onRetirer?: (borneId: number) => void;
}) {
  const { c } = useTheme();
  const recharge = etape.type === 'recharge';
  const icone: NomIcone = etape.type === 'depart' ? 'home-outline' : recharge ? 'ev-station' : 'flag-checkered';

  const contenu = (
    <View style={styles.etape}>
      <View style={styles.rail}>
        <View style={[styles.noeud, { backgroundColor: recharge ? c.action : c.surfaceAlt, borderColor: recharge ? '#F2A3AA' : c.border }]}>
          <Icone name={icone} size={15} color={recharge ? '#FFFFFF' : 'primary'} />
        </View>
        {!derniere && <View style={[styles.ligneRail, { backgroundColor: c.border }]} />}
      </View>
      <View style={styles.etapeCorps}>
        <Texte variant="label" color={recharge ? 'primary' : 'textFaint'}>
          {etape.type === 'depart'
            ? 'Départ'
            : recharge
              ? `Arrêt ${numeroArret}${etape.choisie ? ' · votre choix' : ' · proposé par Volta'} · après ${etape.km} km`
              : `Arrivée · après ${etape.km} km`}
        </Texte>
        <View style={styles.etapeTitre}>
          <Texte variant="subheading" numberOfLines={2} style={{ flex: 1 }}>
            {etape.nom}
          </Texte>
          {recharge && <Icone name="chevron-right" size={22} color="textFaint" />}
        </View>
        {recharge ? (
          <>
            <Texte variant="body" color="text">
              Rechargez{' '}
              <Texte variant="bodyStrong" color="primary">
                {formatDuree(etape.minutes)}
              </Texte>
              , environ{' '}
              <Texte variant="bodyStrong" color="copper">
                {formatNombre(etape.prix, 0)} DT
              </Texte>
            </Texte>
            <Texte variant="body" color="textMuted">
              Batterie : {etape.batterieArrivee} % en arrivant, {etape.batterieDepart} % en repartant
            </Texte>
            <MiniBatterie de={etape.batterieArrivee} a={etape.batterieDepart} />
            {etape.choisie && onRetirer && (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onRetirer(etape.borneId)} style={styles.retirer}>
                <Icone name="close-circle-outline" size={18} color="textMuted" />
                <Texte variant="bodyStrong" color="textMuted">
                  Retirer cet arrêt
                </Texte>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <Texte variant="body" color="textMuted">
              {etape.type === 'depart' ? 'Vous partez avec' : 'Vous arrivez avec'} {etape.batterie} % de batterie
            </Texte>
            <MiniBatterie de={etape.batterie} />
          </>
        )}
      </View>
    </View>
  );

  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 110).duration(420)}>
      {recharge ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Voir ${etape.nom}`}
          onPress={() => router.push({ pathname: '/borne/[id]', params: { id: String(etape.borneId) } })}>
          {contenu}
        </Pressable>
      ) : (
        contenu
      )}
    </Animated.View>
  );
}

/** Résultat d'un trajet : diagnostic en une phrase, chiffres clés, étapes et conseil de Volta. */
export function ResultatTrajet({ trajet, onRetirerArret }: { trajet: Trajet; onRetirerArret?: (borneId: number) => void }) {
  const { c } = useTheme();
  const economie = Math.max(0, trajet.coutEssenceDt - trajet.coutDt);

  const arrets = trajet.etapes.filter((e) => e.type === 'recharge').length;
  let numero = 0;

  return (
    <View style={{ gap: Espace.md }}>
      {/* Réponse en une phrase, avant le détail */}
      <View style={[styles.verdict, { backgroundColor: trajet.possible ? c.primarySoft : c.surfaceAlt }]}>
        <Icone
          name={trajet.verdict === 'batterie_suffit' ? 'battery-check' : trajet.verdict === 'recharge_necessaire' ? 'ev-station' : 'alert-circle-outline'}
          size={28}
          color="primary"
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Texte variant="subheading">
            {trajet.verdict === 'batterie_suffit'
              ? 'Votre batterie suffit'
              : trajet.verdict === 'recharge_necessaire'
                ? `Il faut recharger ${arrets === 1 ? 'une fois' : `${arrets} fois`}`
                : 'Trajet impossible pour le moment'}
          </Texte>
          <Texte variant="body" color="textMuted">
            {trajet.verdict === 'batterie_suffit'
              ? `Vous arrivez à ${trajet.arrivee} sans vous arrêter.`
              : trajet.verdict === 'recharge_necessaire'
                ? `Volta a trouvé ${arrets === 1 ? 'la borne' : 'les bornes'} sur votre route jusqu’à ${trajet.arrivee}.`
                : `Aucune borne ne permet d’atteindre ${trajet.bloqueA ?? trajet.arrivee} avec votre batterie.`}
          </Texte>
        </View>
      </View>
      {trajet.conseil && (
        <View style={[styles.impossible, { backgroundColor: c.surfaceAlt }]}>
          <Icone name="information-outline" size={20} color="primary" />
          <Texte variant="body" style={{ flex: 1 }}>
            {trajet.conseil}
          </Texte>
        </View>
      )}

      {trajet.possible && (
        <Animated.View entering={FadeIn.duration(400)} style={[styles.resumes, { borderColor: c.border }]}>
          <Resume icone="map-marker-distance" valeur={`${trajet.distanceKm} km`} libelle="Distance" />
          <Resume icone="clock-outline" valeur={formatDuree(trajet.minutesConduite + trajet.minutesRecharge)} libelle="Durée totale" />
          <Resume icone="cash" valeur={`${formatNombre(trajet.coutDt, 0)} DT`} libelle="Prix total" />
        </Animated.View>
      )}

      <View>
        {trajet.etapes.map((e, i) => (
          <Etape
            key={`${e.type}-${i}`}
            etape={e}
            index={i}
            derniere={i === trajet.etapes.length - 1}
            numeroArret={e.type === 'recharge' ? ++numero : 0}
            onRetirer={onRetirerArret}
          />
        ))}
        {!trajet.possible && (
          <View style={[styles.impossible, { backgroundColor: c.primarySoft }]}>
            <Icone name="map-marker-off-outline" size={18} color="primary" />
            <Texte variant="captionStrong" style={{ flex: 1 }}>
              Destination hors de portée du réseau actuel.
            </Texte>
          </View>
        )}
      </View>

      {/* Commentaire du copilote */}
      <Animated.View entering={FadeInDown.delay(150 + trajet.etapes.length * 110).duration(450)} style={styles.copilote}>
        <AvatarIA taille={34} />
        <View style={[styles.bulle, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
          {economie > 1 && (
            <Texte variant="bodyStrong" color="primary">
              {formatNombre(economie, 0)} DT de moins qu’en voiture essence
            </Texte>
          )}
          <Texte variant="body" color="text">
            {trajet.commentaire}
          </Texte>
        </View>
      </Animated.View>

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({
            pathname: '/assistant',
            params: { question: `Je pars de ${trajet.depart} pour ${trajet.arrivee}. Quels conseils pour ce trajet ?` },
          })
        }
        style={[styles.relance, { backgroundColor: c.primarySoft }]}>
        <Icone name="robot-happy-outline" size={18} color="primary" />
        <Texte variant="captionStrong" style={{ flex: 1 }}>
          Préparer ce voyage avec Volta
        </Texte>
        <Icone name="arrow-right" size={18} color="primary" />
      </Pressable>
    </View>
  );
}

/**
 * Entrée « Trajet Volta » de l'accueil : une barre « Où voulez-vous aller ? » (comme une
 * appli de cartes) et des destinations rapides. Le trajet s'ouvre sur la carte, depuis
 * la position du conducteur.
 */
export function TrajetVolta() {
  const { c } = useTheme();
  const [villes, setVilles] = useState<VilleTrajet[]>([]);
  const reflet = useSharedValue(0);

  useEffect(() => {
    api.villesTrajet().then(setVilles).catch(() => undefined);
    reflet.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.linear }), -1, false, undefined, ReduceMotion.System);
  }, [reflet]);

  const styleReflet = useAnimatedStyle(() => ({ transform: [{ translateX: -300 + reflet.value * 900 }, { rotate: '20deg' }] }));
  const ouvrir = (ville?: string) => {
    Haptics.selectionAsync().catch(() => undefined);
    router.push(ville ? { pathname: '/trajet', params: { ville } } : '/trajet');
  };

  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.cadre}>
      <LinearGradient colors={['#E5545F', '#2E2E36', '#F2A3AA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Animated.View pointerEvents="none" style={[styles.reflet, styleReflet]}>
        <LinearGradient colors={['#FFFFFF00', '#FFFFFFAA', '#FFFFFF00']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={[styles.carte, { backgroundColor: c.surface }]}>
        <View style={styles.entete}>
          <LinearGradient colors={['#EE7883', '#B83A46']} style={styles.pastille}>
            <Icone name="map-marker-path" size={16} color="#FFFFFF" />
          </LinearGradient>
          <Texte variant="label" color="primary" style={{ flex: 1 }}>
            Trajet Volta
          </Texte>
          <View style={[styles.badgeIa, { borderColor: c.border }]}>
            <Icone name="creation" size={11} color="primary" />
            <Texte variant="label" color="textMuted">
              IA
            </Texte>
          </View>
        </View>

        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Où voulez-vous aller ? Ouvrir la carte"
          onPress={() => ouvrir()}
          style={[styles.recherche, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
          <Icone name="magnify" size={24} color="primary" />
          <Texte variant="bodyStrong" color="textMuted" style={{ flex: 1 }}>
            Où voulez-vous aller ?
          </Texte>
          <Icone name="crosshairs-gps" size={20} color="textFaint" />
        </Pressable>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsConteneur} contentContainerStyle={styles.chips}>
          {villes.map((v) => (
            <Pressable
              key={v.cle}
              accessibilityRole="button"
              accessibilityLabel={`Aller à ${v.nom}`}
              onPress={() => ouvrir(v.cle)}
              style={[styles.chip, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Icone name="flag-variant-outline" size={18} color="textMuted" />
              <Texte variant="bodyStrong">{v.nom}</Texte>
            </Pressable>
          ))}
        </ScrollView>

        <Texte variant="body" color="textMuted">
          Volta part de votre position, vérifie si votre batterie suffit et vous dit où recharger.
        </Texte>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cadre: { borderRadius: Rayons.xl, padding: 1.5, overflow: 'hidden' },
  reflet: { position: 'absolute', top: -100, bottom: -100, width: 120 },
  carte: { borderRadius: Rayons.xl - 1.5, padding: Espace.lg, gap: Espace.md },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pastille: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badgeIa: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: Rayons.pill, paddingHorizontal: 8, paddingVertical: 2 },
  depart: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Rayons.md, paddingHorizontal: 14, minHeight: 52 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Rayons.md, padding: 14 },
  chipsConteneur: { marginHorizontal: -Espace.lg },
  chips: { paddingHorizontal: Espace.lg, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Rayons.pill, paddingHorizontal: 18, height: 48 },
  calcul: { gap: 10, paddingVertical: 6 },
  piste: { height: 34, borderRadius: Rayons.pill, overflow: 'hidden', justifyContent: 'center' },
  trace: { position: 'absolute', left: 0, top: 15, height: 4, borderRadius: 2, overflow: 'hidden' },
  voiturePiste: { position: 'absolute', top: 7 },
  resumes: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Espace.md },
  resume: { flex: 1, alignItems: 'center', gap: 3 },
  tabulaire: { fontVariant: ['tabular-nums'] },
  etape: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 30 },
  noeud: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ligneRail: { width: 2, flex: 1, marginVertical: 2, borderRadius: 1 },
  etapeCorps: { flex: 1, gap: 4, paddingBottom: 16 },
  etapeTitre: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniBatterie: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  miniNiveau: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  impossible: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Rayons.md, padding: 12 },
  copilote: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bulle: { flex: 1, borderWidth: 1, borderRadius: Rayons.md, borderTopLeftRadius: 4, padding: 14, gap: 6 },
  recherche: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: Rayons.pill, paddingHorizontal: 18, minHeight: 56 },
  retirer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  relance: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Rayons.md, paddingHorizontal: 14, paddingVertical: 12 },
});
