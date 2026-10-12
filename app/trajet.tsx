import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalculEnCours, ResultatTrajet } from '@/components/accueil/trajet-volta';
import { EtatBadge } from '@/components/etat-badge';
import { CarteTrajet } from '@/components/trajet/carte-trajet';
import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Espace, Polices, Rayons } from '@/constants/theme';
import { usePosition } from '@/hooks/use-position';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { useConduite } from '@/hooks/use-conduite';
import { activerVoix, taire, useVoix } from '@/lib/voix';
import { formatDuree } from '@/lib/format';
import { avancer, distanceM, formatDistance, urlCartesNatives } from '@/lib/guidage';
import type { Borne, LieuTrouve, PointTrajet, TrajetVolta, VilleTrajet } from '@/types/domain';

/** Départ de repli si la position n'est pas disponible. */
const TUNIS: PointTrajet = { nom: 'Tunis', lat: 36.8065, lng: 10.1815 };

/** Panneau en verre dépoli (flou natif) utilisé pour la recherche, la fiche borne et le trajet. */
function Verre({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.verre, style]}>
      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.verreTeinte} />
      {children}
    </View>
  );
}

/** Guidage : grande consigne en haut, distance et heure d'arrivée en bas. */
function BandeauGuidage({
  trajet,
  etape,
  pos,
  hautSafe,
  basSafe,
  onArreter,
  conduite,
}: {
  trajet: TrajetVolta;
  etape: number;
  pos: { lat: number; lng: number } | null;
  hautSafe: number;
  basSafe: number;
  onArreter: () => void;
  conduite: ReturnType<typeof useConduite>;
}) {
  const consigne = trajet.instructions[etape];
  const suivante = trajet.instructions[etape + 1];
  const jusqua = pos && consigne ? distanceM(pos, consigne) : (consigne?.distanceM ?? 0);
  const reste = conduite.resteKm * 1000;
  const minutes = conduite.minutes;
  const arrivee = new Date(Date.now() + minutes * 60000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const alerte = conduite.bandeau;
  const voix = useVoix();

  if (!consigne) return null;
  return (
    <>
      <View style={[styles.consigne, { top: hautSafe + 8 }]}>
        <View style={styles.consigneHaut}>
          <Icone name={consigne.icone as NomIcone} size={46} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Texte variant="title" color="#FFFFFF">
              {formatDistance(jusqua)}
            </Texte>
            <Texte variant="subheading" color="#FFFFFF" numberOfLines={2}>
              {consigne.texte}
            </Texte>
          </View>
        </View>
        {suivante && (
          <View style={styles.consigneSuivante}>
            <Texte variant="body" color="#FFFFFFCC" numberOfLines={1}>
              Ensuite : {suivante.texte}
            </Texte>
          </View>
        )}
      </View>
      {alerte && (
        <Animated.View key={alerte.cle} entering={FadeInDown.duration(300)} exiting={FadeOut.duration(200)} style={[styles.alerteConduite, { top: hautSafe + 150 }, alerte.type === 'batterie_critique' && styles.alerteCritique]}>
          <Icone name={alerte.type.startsWith('batterie') ? 'battery-alert-variant-outline' : 'ev-station'} size={26} color="#E5545F" />
          <View style={{ flex: 1 }}>
            <Texte variant="bodyStrong" color="#FFFFFF">
              {alerte.titre}
            </Texte>
            <Texte variant="caption" color="#FFFFFFCC">
              {alerte.texte}
            </Texte>
          </View>
        </Animated.View>
      )}
      <View style={[styles.barreGuidage, { paddingBottom: basSafe + 12 }]}>
        <View style={styles.batterieConduite}>
          <Icone name={conduite.batterie < 20 ? 'battery-alert-variant-outline' : 'battery-charging-60'} size={22} color={conduite.batterie < 20 ? '#E5545F' : '#FFFFFF'} />
          <Texte variant="bodyStrong" color={conduite.batterie < 20 ? '#E5545F' : '#FFFFFF'}>
            {conduite.batterie} %
          </Texte>
          <Texte variant="caption" color="textMuted" numberOfLines={1}>
            ≈ {conduite.autonomie} km
          </Texte>
        </View>
        <View style={{ flex: 1 }}>
          <Texte variant="title" numberOfLines={1}>{arrivee}</Texte>
          <Texte variant="body" color="textMuted" numberOfLines={1}>
            {formatDistance(reste)} · {formatDuree(minutes)}
          </Texte>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={voix ? 'Couper la voix' : 'Activer la voix'} onPress={() => activerVoix(!voix)} style={styles.vitesse}>
          <Icone name={voix ? 'volume-high' : 'volume-off'} size={22} color="#FFFFFF" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={conduite.mode === 'simulation' ? 'Vitesse de la simulation' : 'Simuler la conduite'}
          onPress={conduite.mode === 'simulation' ? conduite.accelerer : conduite.simuler}
          style={styles.vitesse}>
          <Texte variant="captionStrong" color="#FFFFFF">
            {conduite.mode === 'simulation' ? `×${conduite.vitesse}` : 'Simuler'}
          </Texte>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onArreter} style={styles.arreter}>
          <Texte variant="bodyStrong" color="#FFFFFF">
            Arrêter
          </Texte>
        </Pressable>
      </View>
    </>
  );
}

/**
 * « Trajet Volta » en plein écran, comme une appli de cartes : départ depuis la position
 * GPS, recherche d'adresse (ou appui long sur la carte), tracé sur les routes réelles,
 * arrêts recharge proposés par Volta ou choisis en touchant une borne sur la carte.
 */
export default function TrajetScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{ ville?: string; borneId?: string }>();
  const { position, statut, localiser } = usePosition();

  const [bornes, setBornes] = useState<Borne[]>([]);
  const [villes, setVilles] = useState<VilleTrajet[]>([]);
  const [destination, setDestination] = useState<PointTrajet | null>(null);
  const [recherche, setRecherche] = useState('');
  const [lieux, setLieux] = useState<LieuTrouve[]>([]);
  const [chercheLieux, setChercheLieux] = useState(false);
  const [choisies, setChoisies] = useState<number[]>([]);
  const [batterie, setBatterie] = useState<number | null>(null);
  const [trajet, setTrajet] = useState<TrajetVolta | null>(null);
  const [calcul, setCalcul] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [borneOuverte, setBorneOuverte] = useState<Borne | null>(null);
  // Point touché sur la carte : épingle + fiche « Y aller », comme dans une appli de cartes.
  const [epingle, setEpingle] = useState<(PointTrajet & { detail?: string; enCours?: boolean }) | null>(null);
  const [replie, setReplie] = useState(false);
  const requete = useRef(0);
  // Guidage pas à pas vers la destination (ou la borne choisie).
  const [guidage, setGuidage] = useState(false);
  const [posGuidage, setPosGuidage] = useState<{ lat: number; lng: number; cap: number | null } | null>(null);
  const [etape, setEtape] = useState(0);

  const depart = position ?? (statut === 'recherche' ? null : TUNIS);
  // Sans destination, la fiche reste basse : la carte est l'outil principal pour choisir.
  const hauteurFiche = replie ? 150 : Math.round(height * (destination ? 0.46 : 0.3));

  useEffect(() => {
    api.listeBornes().then(setBornes).catch(() => undefined);
    api.villesTrajet().then(setVilles).catch(() => undefined);
  }, []);

  // Destination passée par l'accueil (ville) ou par une fiche borne (itinéraire vers la borne).
  useEffect(() => {
    if (params.ville && villes.length) {
      const v = villes.find((x) => x.cle === params.ville);
      if (v) setDestination({ nom: v.nom, lat: v.lat, lng: v.lng });
    }
  }, [params.ville, villes]);
  useEffect(() => {
    const b = bornes.find((x) => String(x.id) === params.borneId);
    if (b) setDestination({ nom: b.nom, lat: b.latitude, lng: b.longitude });
  }, [params.borneId, bornes]);

  // Recherche d'adresse, avec un court délai pendant la frappe.
  useEffect(() => {
    const q = recherche.trim();
    if (q.length < 2) {
      setLieux([]);
      return;
    }
    setChercheLieux(true);
    const t = setTimeout(() => {
      api
        .rechercherLieux(q)
        .then(setLieux)
        .catch(() => setLieux([]))
        .finally(() => setChercheLieux(false));
    }, 350);
    return () => clearTimeout(t);
  }, [recherche]);

  // Calcul (ou recalcul) dès que le départ, la destination, la batterie ou les arrêts changent.
  useEffect(() => {
    if (!depart || !destination) return;
    const numero = ++requete.current;
    setCalcul(true);
    setErreur(null);
    Promise.all([api.planifierTrajet(depart, destination, batterie, choisies), new Promise((ok) => setTimeout(ok, 700))])
      .then(([r]) => {
        if (numero !== requete.current) return;
        setTrajet(r);
        if (batterie == null) setBatterie(r.etapes[0]?.type === 'depart' ? r.etapes[0].batterie : null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      })
      .catch((e) => numero === requete.current && setErreur(e instanceof Error ? e.message : 'Calcul impossible pour le moment.'))
      .finally(() => numero === requete.current && setCalcul(false));
    // `batterie` fixée par la réponse ne doit pas relancer de calcul inutile : seule une action de l'utilisateur la change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depart?.lat, depart?.lng, destination, choisies, batterie]);

  const [capacite, setCapacite] = useState(60);
  useEffect(() => {
    api.listeVehicules().then((v) => v[0] && setCapacite(v[0].capaciteBatterieKwh)).catch(() => undefined);
  }, []);
  const conduite = useConduite(trajet, guidage, position ?? null, () => setGuidage(false), capacite);
  // Pendant la conduite, seul l'itinéraire restant est tracé.
  const trajetAffiche = useMemo(() => (guidage && trajet && conduite.restant ? { ...trajet, trace: conduite.restant } : trajet), [guidage, trajet, conduite.restant]);
  useEffect(() => {
    if (!guidage || !trajet || !conduite.pos) return;
    const pos = conduite.pos;
    setPosGuidage(pos);
    setEtape(conduite.mode === 'simulation' ? conduite.etape : (i) => avancer(trajet.instructions, i, pos));
  }, [guidage, trajet, conduite.pos, conduite.mode, conduite.etape]);

  const demarrerGuidage = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setEtape(0);
    setPosGuidage(depart ? { lat: depart.lat, lng: depart.lng, cap: null } : null);
    setBorneOuverte(null);
    setGuidage(true);
  };

  const allerALaBorne = (b: Borne) => {
    Haptics.selectionAsync().catch(() => undefined);
    setBorneOuverte(null);
    setEpingle(null);
    setChoisies([]);
    setReplie(false);
    setDestination({ nom: b.nom, lat: b.latitude, lng: b.longitude });
  };

  const choisirLieu = (l: PointTrajet) => {
    Keyboard.dismiss();
    setEpingle(null);
    setRecherche('');
    setLieux([]);
    setChoisies([]);
    setReplie(false);
    setDestination({ nom: l.nom, lat: l.lat, lng: l.lng });
  };

  const toucherCarte = useCallback((lat: number, lng: number) => {
    Keyboard.dismiss();
    setBorneOuverte(null);
    // Une destination est déjà choisie : toucher la carte ferme simplement les fiches.
    if (destination) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setEpingle({ nom: 'Recherche de l’adresse…', lat, lng, enCours: true });
    api
      .lieuAuPoint(lat, lng)
      .then((l) => setEpingle((e) => (e && e.lat === lat && e.lng === lng ? { ...l, enCours: false } : e)))
      .catch(() => setEpingle((e) => (e && e.lat === lat ? { nom: 'Point sur la carte', lat, lng, enCours: false } : e)));
  }, [destination]);

  const basculerArret = useCallback((id: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    setChoisies((avant) => (avant.includes(id) ? avant.filter((x) => x !== id) : [...avant, id].slice(-3)));
    setBorneOuverte(null);
  }, []);

  const changerBatterie = (pas: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    setBatterie((b) => Math.max(5, Math.min(100, (b ?? 50) + pas)));
  };

  const styleFiche = useAnimatedStyle(() => ({ height: withSpring(hauteurFiche, { damping: 20, stiffness: 180 }) }));
  const suggestions = useMemo(() => (recherche.trim().length >= 2 ? lieux : []), [lieux, recherche]);

  return (
    <View style={[styles.ecran, { backgroundColor: c.background }]}>
      <CarteTrajet
        bornes={bornes}
        moi={depart}
        gps={!!position}
        destination={destination}
        epingle={epingle}
        trajet={trajetAffiche}
        choisies={choisies}
        hautCarte={insets.top + 150}
        basCarte={hauteurFiche}
        onBorne={(id) => {
          setEpingle(null);
          setBorneOuverte(bornes.find((b) => b.id === id) ?? null);
        }}
        onPointChoisi={toucherCarte}
        guidage={guidage ? posGuidage : null}
        voiture={guidage && conduite.mode === 'simulation' ? posGuidage : null}
      />

      {guidage && trajet && (
        <BandeauGuidage
          trajet={trajet}
          etape={etape}
          pos={posGuidage}
          hautSafe={insets.top}
          basSafe={insets.bottom}
          onArreter={() => {
            taire();
            setGuidage(false);
          }}
          conduite={conduite}
        />
      )}

      {/* Recherche, en haut */}
      <View style={[styles.haut, { paddingTop: insets.top + 8 }, guidage && styles.cache]}>
        <Verre style={styles.panneauRecherche}>
          <View style={styles.ligneDepart}>
            <Pressable accessibilityRole="button" accessibilityLabel="Retour" onPress={() => router.back()} hitSlop={10} style={styles.retour}>
              <Icone name="arrow-left" size={24} color="text" />
            </Pressable>
            <View style={[styles.pointMoi, { borderColor: c.primary }]} />
            <Texte variant="body" color="textMuted" style={{ flex: 1 }} numberOfLines={1}>
              {statut === 'recherche' && !position
                ? 'Recherche de votre position…'
                : position
                  ? 'Départ : ma position'
                  : 'Départ : Tunis (position non autorisée)'}
            </Texte>
            {!position && statut !== 'recherche' && (
              <Pressable accessibilityRole="button" onPress={localiser} hitSlop={8}>
                <Texte variant="bodyStrong" color="primary">
                  Activer
                </Texte>
              </Pressable>
            )}
          </View>
          <View style={[styles.champ, { backgroundColor: '#FFFFFF12', borderColor: '#FFFFFF1F' }]}>
            <Icone name="magnify" size={22} color="primary" />
            <TextInput
              value={recherche}
              onChangeText={setRecherche}
              placeholder={destination ? destination.nom : 'Où voulez-vous aller ?'}
              placeholderTextColor={destination ? c.text : c.textMuted}
              style={[styles.saisie, { color: c.text }]}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Destination"
            />
            {chercheLieux ? (
              <ActivityIndicator color={c.primary} />
            ) : recherche ? (
              <Pressable accessibilityLabel="Effacer" onPress={() => setRecherche('')} hitSlop={8}>
                <Icone name="close-circle" size={20} color="textFaint" />
              </Pressable>
            ) : null}
          </View>

          {suggestions.length > 0 && (
            <Animated.View entering={FadeIn.duration(180)} style={styles.suggestions}>
              {suggestions.map((l, i) => (
                <Pressable
                  key={`${l.lat}-${l.lng}-${i}`}
                  accessibilityRole="button"
                  onPress={() => choisirLieu(l)}
                  style={[styles.suggestion, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FFFFFF1F' }]}>
                  <Icone name="map-marker-outline" size={22} color="primary" />
                  <View style={{ flex: 1 }}>
                    <Texte variant="bodyStrong" numberOfLines={1}>
                      {l.nom}
                    </Texte>
                    {!!l.detail && (
                      <Texte variant="caption" color="textMuted" numberOfLines={1}>
                        {l.detail}
                      </Texte>
                    )}
                  </View>
                </Pressable>
              ))}
            </Animated.View>
          )}
        </Verre>
      </View>

      {/* Épingle posée sur la carte : nom du lieu et « Y aller » */}
      {epingle && !destination && (
        <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOutDown.duration(180)} style={[styles.ficheBorne, { bottom: hauteurFiche + 12 }]}>
          <Verre style={styles.ficheBorneVerre}>
            <Icone name="map-marker" size={30} color="primary" />
            <View style={{ flex: 1, gap: 2 }}>
              <Texte variant="subheading" numberOfLines={2}>
                {epingle.nom}
              </Texte>
              {!!epingle.detail && (
                <Texte variant="body" color="textMuted" numberOfLines={1}>
                  {epingle.detail}
                </Texte>
              )}
            </View>
            <View style={{ gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                disabled={epingle.enCours}
                onPress={() => choisirLieu(epingle)}
                style={[styles.boutonFiche, styles.boutonAller, { backgroundColor: c.action, opacity: epingle.enCours ? 0.6 : 1 }]}>
                <Icone name="navigation-variant" size={20} color="#FFFFFF" />
                <Texte variant="bodyStrong" color="#FFFFFF">
                  Y aller
                </Texte>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setEpingle(null)} style={styles.fermer}>
                <Texte variant="bodyStrong" color="textMuted">
                  Fermer
                </Texte>
              </Pressable>
            </View>
          </Verre>
        </Animated.View>
      )}

      {/* Fiche borne touchée sur la carte : en faire un arrêt */}
      {borneOuverte && (
        <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOutDown.duration(180)} style={[styles.ficheBorne, { bottom: hauteurFiche + 12 }]}>
          <Verre style={styles.ficheBorneVerre}>
            <View style={{ flex: 1, gap: 4 }}>
              <Texte variant="subheading" numberOfLines={1}>
                {borneOuverte.nom}
              </Texte>
              <View style={styles.ligneInfos}>
                <EtatBadge etat={borneOuverte.etat} surEncre />
                <Texte variant="bodyStrong" color="textMuted">
                  {borneOuverte.puissanceKw} kW
                </Texte>
              </View>
            </View>
            <View style={{ gap: 8 }}>
              {/* Itinéraire direct vers la borne, comme dans une appli de cartes */}
              <Pressable
                accessibilityRole="button"
                onPress={() => allerALaBorne(borneOuverte)}
                style={[styles.boutonFiche, styles.boutonAller, { backgroundColor: c.action }]}>
                <Icone name="navigation-variant" size={18} color="#FFFFFF" />
                <Texte variant="bodyStrong" color="#FFFFFF">
                  Itinéraire
                </Texte>
              </Pressable>
              {destination && distanceM(destination, { lat: borneOuverte.latitude, lng: borneOuverte.longitude }) > 200 && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => basculerArret(borneOuverte.id)}
                  style={[styles.boutonFiche, { backgroundColor: c.surfaceAlt }]}>
                  <Texte variant="bodyStrong" color="#FFFFFF">
                    {choisies.includes(borneOuverte.id) ? 'Retirer l’arrêt' : 'Arrêt en route'}
                  </Texte>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={() => setBorneOuverte(null)} style={styles.fermer}>
                <Texte variant="bodyStrong" color="textMuted">
                  Fermer
                </Texte>
              </Pressable>
            </View>
          </Verre>
        </Animated.View>
      )}

      {/* Fiche du trajet, en bas (touchez la poignée pour la replier) */}
      <Animated.View style={[styles.fiche, styleFiche, guidage && styles.cache]}>
        <Verre style={styles.ficheVerre}>
          <Pressable accessibilityRole="button" accessibilityLabel={replie ? 'Déplier le trajet' : 'Replier le trajet'} onPress={() => setReplie((r) => !r)} style={styles.poignee}>
            <View style={styles.barrePoignee} />
          </Pressable>
          <ScrollView contentContainerStyle={[styles.ficheContenu, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
            {!destination ? (
              <View style={{ gap: Espace.md }}>
                <Texte variant="heading">Où voulez-vous aller ?</Texte>
                <View style={styles.aide}>
                  <Icone name="gesture-tap" size={26} color="primary" />
                  <Texte variant="body" style={{ flex: 1 }}>
                    Touchez la carte à l’endroit où vous voulez aller, ou tapez une adresse en haut.
                  </Texte>
                </View>
                <Texte variant="label" color="textFaint">
                  Raccourcis
                </Texte>
                <View style={styles.villes}>
                  {villes.slice(0, 8).map((v) => (
                    <Pressable
                      key={v.cle}
                      accessibilityRole="button"
                      onPress={() => choisirLieu(v)}
                      style={[styles.ville, { backgroundColor: '#FFFFFF12', borderColor: '#FFFFFF1F' }]}>
                      <Icone name="flag-variant-outline" size={18} color="primary" />
                      <Texte variant="bodyStrong">{v.nom}</Texte>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <View style={{ gap: Espace.md }}>
                <View style={styles.titreTrajet}>
                  <Texte variant="heading" style={{ flex: 1 }} numberOfLines={2}>
                    Vers {destination.nom}
                  </Texte>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setDestination(null);
                      setTrajet(null);
                      setChoisies([]);
                    }}
                    hitSlop={8}>
                    <Texte variant="bodyStrong" color="primary">
                      Changer
                    </Texte>
                  </Pressable>
                </View>

                {/* Batterie actuelle, modifiable en grand */}
                <View style={[styles.batterie, { backgroundColor: '#FFFFFF0D', borderColor: '#FFFFFF1F' }]}>
                  <Icone name="battery-charging-60" size={24} color="primary" />
                  <View style={{ flex: 1 }}>
                    <Texte variant="body" color="textMuted">
                      Batterie au départ
                    </Texte>
                    <Texte variant="title">{batterie ?? '—'} %</Texte>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Moins 5 %" onPress={() => changerBatterie(-5)} style={[styles.pas, { backgroundColor: c.surfaceAlt }]}>
                    <Icone name="minus" size={24} color="text" />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Plus 5 %" onPress={() => changerBatterie(5)} style={[styles.pas, { backgroundColor: c.surfaceAlt }]}>
                    <Icone name="plus" size={24} color="text" />
                  </Pressable>
                </View>

                {calcul ? (
                  <CalculEnCours />
                ) : erreur ? (
                  <Texte variant="body" color="danger">
                    {erreur}
                  </Texte>
                ) : trajet ? (
                  <>
                    {trajet.possible && (
                      <View style={styles.demarrer}>
                        {trajet.instructions.length > 0 && (
                          <Pressable accessibilityRole="button" onPress={demarrerGuidage} style={[styles.boutonDemarrer, { backgroundColor: c.action }]}>
                            <Icone name="navigation-variant" size={24} color="#FFFFFF" />
                            <Texte variant="subheading" color="#FFFFFF">
                              Démarrer
                            </Texte>
                          </Pressable>
                        )}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Ouvrir dans l’appli de cartes du téléphone"
                          onPress={() => destination && Linking.openURL(urlCartesNatives(destination, Platform.OS === 'ios'))}
                          style={[styles.boutonDemarrer, styles.boutonSecondaire]}>
                          <Icone name="map-search-outline" size={22} color="#FFFFFF" />
                          <Texte variant="bodyStrong" color="#FFFFFF">
                            {Platform.OS === 'ios' ? 'Plans' : 'Maps'}
                          </Texte>
                        </Pressable>
                      </View>
                    )}
                    <ResultatTrajet trajet={trajet} onRetirerArret={basculerArret} />
                    <View style={styles.astuce}>
                      <Icone name="gesture-tap" size={18} color="textFaint" />
                      <Texte variant="caption" color="textMuted" style={{ flex: 1 }}>
                        Touchez une borne ⚡ sur la carte pour choisir vous-même où vous arrêter.
                        {trajet.routeReelle ? '' : ' Distances estimées (routes indisponibles).'}
                      </Texte>
                    </View>
                  </>
                ) : null}
              </View>
            )}
          </ScrollView>
        </Verre>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1 },
  verre: { borderRadius: Rayons.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF2E' },
  verreTeinte: { ...StyleSheet.absoluteFillObject, backgroundColor: '#121215A6' },
  haut: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: Espace.md },
  panneauRecherche: { padding: 12, gap: 10 },
  ligneDepart: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  retour: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pointMoi: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, backgroundColor: '#FFFFFF' },
  champ: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Rayons.pill, paddingHorizontal: 16, minHeight: 54 },
  saisie: { flex: 1, fontFamily: Polices.bodyBold, fontSize: 17, paddingVertical: 12 },
  suggestions: { borderRadius: Rayons.md, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 6, minHeight: 56 },
  ficheBorne: { position: 'absolute', left: Espace.md, right: Espace.md },
  ficheBorneVerre: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  ligneInfos: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boutonFiche: { borderRadius: Rayons.pill, paddingHorizontal: 18, height: 46, alignItems: 'center', justifyContent: 'center' },
  fermer: { alignItems: 'center', height: 28, justifyContent: 'center' },
  fiche: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  ficheVerre: { flex: 1, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  poignee: { alignItems: 'center', paddingVertical: 10 },
  barrePoignee: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#FFFFFF55' },
  ficheContenu: { paddingHorizontal: Espace.lg },
  villes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ville: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Rayons.pill, paddingHorizontal: 16, height: 48 },
  titreTrajet: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  batterie: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: Rayons.lg, padding: 14 },
  pas: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  astuce: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cache: { display: 'none' },
  demarrer: { flexDirection: 'row', gap: 10 },
  boutonDemarrer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 58, borderRadius: Rayons.pill, paddingHorizontal: 22, flexGrow: 1 },
  boutonSecondaire: { flexGrow: 0, backgroundColor: '#FFFFFF1F', borderWidth: 1, borderColor: '#FFFFFF33' },
  consigne: { position: 'absolute', left: 12, right: 12, borderRadius: Rayons.lg, backgroundColor: '#9E2F3A', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12 },
  consigneHaut: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  consigneSuivante: { backgroundColor: '#00000033', paddingHorizontal: 16, paddingVertical: 10 },
  alerteConduite: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: Rayons.lg, backgroundColor: '#1C1C20F2', borderWidth: 1, borderColor: '#E5545F66' },
  alerteCritique: { backgroundColor: '#3A1419F2', borderColor: '#E5545F' },
  batterieConduite: { alignItems: 'center', gap: 2, paddingRight: 4 },
  vitesse: { minWidth: 48, height: 48, paddingHorizontal: 10, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF14' },
  barreGuidage: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, paddingHorizontal: 20, backgroundColor: '#121215F2', borderTopLeftRadius: Rayons.xl, borderTopRightRadius: Rayons.xl },
  arreter: { backgroundColor: '#B83A46', height: 54, paddingHorizontal: 26, borderRadius: Rayons.pill, alignItems: 'center', justifyContent: 'center' },
  aide: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Rayons.md, padding: 14, backgroundColor: '#E5545F1F' },
  boutonAller: { flexDirection: 'row', gap: 6 },
});
