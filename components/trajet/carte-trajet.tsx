import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, type MapPressEvent } from 'react-native-maps';

import { Icone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { VoitureDessus } from '@/components/illustrations/voiture';
import type { Borne, PointTrajet, TrajetVolta } from '@/types/domain';

type Props = {
  bornes: Borne[];
  moi: PointTrajet | null;
  /** true : `moi` vient du GPS (point bleu natif) ; sinon départ choisi par défaut. */
  gps: boolean;
  destination: PointTrajet | null;
  /** Point touché sur la carte, en attente de confirmation (« Y aller »). */
  epingle: PointTrajet | null;
  trajet: TrajetVolta | null;
  choisies: number[];
  onBorne: (id: number) => void;
  /** Toucher la carte n'importe où : choisir ce point comme destination. */
  onPointChoisi: (lat: number, lng: number) => void;
  /** Hauteurs occupées par les panneaux (haut et bas), pour cadrer le trajet. */
  hautCarte: number;
  basCarte: number;
  /** Guidage en cours : la caméra suit le conducteur, inclinée dans le sens de la marche. */
  guidage?: { lat: number; lng: number; cap: number | null } | null;
  /** Voiture simulée qui avance sur le tracé (hors GPS réel). */
  voiture?: { lat: number; lng: number; cap: number | null } | null;
};

const TUNISIE = { latitude: 35.6, longitude: 10.1, latitudeDelta: 5.2, longitudeDelta: 4.2 };

/** Pastille d'une borne : ⚡, ou numéro d'arrêt sur le trajet. */
function PastilleBorne({ numero, attenuee, choisie }: { numero: number | null; attenuee: boolean; choisie: boolean }) {
  const arret = numero != null;
  return (
    <View style={[styles.borne, arret && styles.borneArret, choisie && styles.borneChoisie, attenuee && !arret && { opacity: 0.55 }]}>
      {arret ? (
        <Texte variant="captionStrong" color="#FFFFFF">
          {numero}
        </Texte>
      ) : (
        <Icone name="lightning-bolt" size={14} color="#F2A3AA" />
      )}
    </View>
  );
}

/**
 * Carte native (Apple Plans sur iPhone, Google Maps sur Android) avec vue Plan ou Satellite,
 * position GPS, bornes, tracé routier et arrêts. Toucher la carte place une épingle.
 */
export function CarteTrajet({ bornes, moi, gps, destination, epingle, trajet, choisies, onBorne, onPointChoisi, hautCarte, basCarte, guidage, voiture }: Props) {
  const carte = useRef<MapView>(null);
  const [satellite, setSatellite] = useState(true);
  const ignorerProchainAppui = useRef(false);
  const region = useRef(TUNISIE);

  // Guidage : vue « conduite » qui suit la voiture.
  useEffect(() => {
    if (!guidage) return;
    if (voiture) {
      // Simulation : la caméra suit la voiture sans retard, un peu en hauteur pour voir la route.
      carte.current?.setCamera({ center: { latitude: guidage.lat, longitude: guidage.lng }, pitch: 45, heading: guidage.cap ?? 0, altitude: 1600, zoom: 15 });
      return;
    }
    carte.current?.animateCamera(
      { center: { latitude: guidage.lat, longitude: guidage.lng }, pitch: 55, heading: guidage.cap ?? 0, altitude: 450, zoom: 17 },
      { duration: 800 }
    );
  }, [guidage, voiture]);

  const zoomer = (facteur: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    const r = region.current;
    carte.current?.animateToRegion(
      { ...r, latitudeDelta: Math.min(20, Math.max(0.002, r.latitudeDelta * facteur)), longitudeDelta: Math.min(20, Math.max(0.002, r.longitudeDelta * facteur)) },
      250
    );
  };

  const arrets = (trajet?.etapes ?? []).flatMap((e) => (e.type === 'recharge' ? [e.borneId] : []));
  const trace = (trajet?.trace ?? []).map(([latitude, longitude]) => ({ latitude, longitude }));

  // Cadre le trajet (ou la destination, ou ma position) entre les panneaux.
  useEffect(() => {
    if (guidage) return;
    const points = [
      ...trace,
      ...(moi ? [{ latitude: moi.lat, longitude: moi.lng }] : []),
      ...(destination ? [{ latitude: destination.lat, longitude: destination.lng }] : []),
    ];
    if (points.length > 1) {
      carte.current?.fitToCoordinates(points, { edgePadding: { top: hautCarte + 30, right: 50, bottom: basCarte + 30, left: 50 }, animated: true });
    } else if (points.length === 1) {
      // Région plutôt que « zoom » : fonctionne avec Apple Plans comme avec Google Maps.
      carte.current?.animateToRegion({ ...points[0], latitudeDelta: 0.12, longitudeDelta: 0.12 }, 700);
    }
    // Recadrer seulement quand le trajet ou les extrémités changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trajet, destination?.lat, destination?.lng, moi?.lat, moi?.lng, basCarte]);

  const recentrer = () => {
    Haptics.selectionAsync().catch(() => undefined);
    if (moi) carte.current?.animateToRegion({ latitude: moi.lat, longitude: moi.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 600);
  };

  const surAppui = (e: MapPressEvent) => {
    // Un appui sur une borne déclenche aussi l'appui sur la carte : on l'ignore.
    if (ignorerProchainAppui.current || e.nativeEvent.action === 'marker-press') {
      ignorerProchainAppui.current = false;
      return;
    }
    onPointChoisi(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={carte}
        style={StyleSheet.absoluteFill}
        initialRegion={TUNISIE}
        mapType={satellite ? 'hybrid' : 'standard'}
        userInterfaceStyle="dark"
        showsUserLocation={gps && !voiture}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest
        showsBuildings
        pitchEnabled
        zoomEnabled
        onRegionChangeComplete={(r) => (region.current = r)}
        onPress={surAppui}>
        {bornes
          .filter((b) => b.source === 'reseau')
          .map((b) => {
            const n = arrets.indexOf(b.id);
            return (
              <Marker
                key={`b${b.id}-${n}-${choisies.includes(b.id)}-${trace.length > 0}`}
                coordinate={{ latitude: b.latitude, longitude: b.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
                zIndex={n >= 0 ? 20 : 5}
                onPress={() => {
                  ignorerProchainAppui.current = true;
                  onBorne(b.id);
                }}>
                <PastilleBorne numero={n >= 0 ? n + 1 : null} attenuee={trace.length > 0} choisie={choisies.includes(b.id)} />
              </Marker>
            );
          })}

        {trace.length > 1 && (
          // Une seule ligne : deux tracés superposés s'affichent mal avec Apple Plans.
          <Polyline coordinates={trace} strokeColor="#E5545F" strokeWidth={7} lineCap="round" lineJoin="round" zIndex={2} />
        )}

        {moi && !gps && !voiture && <Marker coordinate={{ latitude: moi.lat, longitude: moi.lng }} title="Départ" pinColor="#FFFFFF" />}
        {destination && <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title={destination.nom} pinColor="#E5545F" zIndex={30} />}
        {epingle && !destination && <Marker coordinate={{ latitude: epingle.lat, longitude: epingle.lng }} pinColor="#E5545F" zIndex={30} />}
      </MapView>

      {/* Conduite simulée : la caméra suit la voiture, qui reste au centre et pointe vers la route. */}
      {voiture && (
        <View pointerEvents="none" style={styles.voitureCentre}>
          <View style={[styles.voiture, { transform: [{ rotate: '-90deg' }] }]}>
            <VoitureDessus taille={38} />
          </View>
        </View>
      )}

      {/* Commandes de la carte, comme dans une appli de cartes */}
      <View style={[styles.commandes, { top: hautCarte + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={satellite ? 'Vue plan' : 'Vue satellite'}
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setSatellite((s) => !s);
          }}
          style={styles.commande}>
          <Icone name={satellite ? 'map-outline' : 'satellite-variant'} size={22} color="#FFFFFF" />
          <Texte variant="label" color="#FFFFFF">
            {satellite ? 'Plan' : 'Satellite'}
          </Texte>
        </Pressable>
        {moi && !guidage && (
          <Pressable accessibilityRole="button" accessibilityLabel="Centrer sur ma position" onPress={recentrer} style={styles.commande}>
            <Icone name="crosshairs-gps" size={22} color="#FFFFFF" />
          </Pressable>
        )}
        {/* Zoom, comme les boutons + / − d'une appli de cartes */}
        <View style={styles.zoom}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoomer" onPress={() => zoomer(0.4)} style={styles.zoomBouton}>
            <Icone name="plus" size={26} color="#FFFFFF" />
          </Pressable>
          <View style={styles.zoomTrait} />
          <Pressable accessibilityRole="button" accessibilityLabel="Dézoomer" onPress={() => zoomer(2.5)} style={styles.zoomBouton}>
            <Icone name="minus" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  borne: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1D',
    borderWidth: 2,
    borderColor: '#E5545F',
  },
  voitureCentre: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  voiture: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5545F33' },
  borneArret: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#B83A46', borderColor: '#FFFFFF' },
  borneChoisie: { borderColor: '#F2A3AA', borderWidth: 3 },
  commandes: { position: 'absolute', right: 14, gap: 10, alignItems: 'flex-end' },
  zoom: { width: 52, borderRadius: 16, backgroundColor: '#121215E6', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF33', overflow: 'hidden' },
  zoomBouton: { height: 52, alignItems: 'center', justifyContent: 'center' },
  zoomTrait: { height: StyleSheet.hairlineWidth, backgroundColor: '#FFFFFF33' },
  commande: {
    minWidth: 52,
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 8,
    backgroundColor: '#121215E6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFFFFF33',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
