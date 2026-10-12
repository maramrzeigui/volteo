import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, type MapPressEvent, type Region } from 'react-native-maps';

import { Icone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Colors, EtatBorneCouleurs } from '@/constants/theme';
import type { Borne } from '@/types/domain';

export type CarteBornesRef = { recentrer: () => void };

type Props = {
  bornes: Borne[];
  visibles: number[];
  choisie: number | null;
  onChoisir: (id: number | null) => void;
  /** Hauteur occupée par le résumé et les filtres en haut de l'écran. */
  haut: number;
};

const TUNISIE: Region = { latitude: 35.6, longitude: 10.1, latitudeDelta: 5.2, longitudeDelta: 4.2 };

/** Pastille « 60 kW » colorée selon l'état de la borne. */
function Pastille({ borne, active }: { borne: Borne; active: boolean }) {
  const c = Colors.dark;
  const publique = borne.source === 'publique';
  const couleur = publique ? c.surface : c[(EtatBorneCouleurs[borne.etat] ?? { couleur: 'neutral' as const }).couleur];
  return (
    <View style={{ alignItems: 'center', transform: [{ scale: active ? 1.18 : 1 }] }}>
      <View style={[styles.bulle, { backgroundColor: couleur, borderColor: active ? '#FFFFFF' : c.surface }]}>
        <Icone name="lightning-bolt" size={12} color={publique ? c.textMuted : '#FFFFFF'} />
        <Texte variant="captionStrong" color={publique ? c.textMuted : '#FFFFFF'}>
          {publique ? (borne.operateur ?? 'Public') : `${borne.puissanceKw ?? '—'} kW`}
        </Texte>
      </View>
      <View style={[styles.queue, { backgroundColor: couleur }]} />
    </View>
  );
}

/**
 * Carte réelle (Apple Plans sur iPhone, Google Maps sur Android) : vue Plan ou Satellite,
 * position GPS, zoom, et les bornes en pastilles touchables.
 */
export const CarteBornes = forwardRef<CarteBornesRef, Props>(function CarteBornes({ bornes, visibles, choisie, onChoisir, haut }, ref) {
  const carte = useRef<MapView>(null);
  const region = useRef(TUNISIE);
  const appuiBorne = useRef(false);
  const [satellite, setSatellite] = useState(false);
  const [gps, setGps] = useState(false);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then((p) => setGps(p.granted))
      .catch(() => undefined);
  }, []);

  const affichees = bornes.filter((b) => visibles.includes(b.id));

  const recentrer = () => {
    const points = affichees.map((b) => ({ latitude: b.latitude, longitude: b.longitude }));
    if (points.length > 1) carte.current?.fitToCoordinates(points, { edgePadding: { top: haut + 40, right: 60, bottom: 200, left: 60 }, animated: true });
    else if (points.length === 1) carte.current?.animateToRegion({ ...points[0], latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600);
    else carte.current?.animateToRegion(TUNISIE, 600);
  };
  useImperativeHandle(ref, () => ({ recentrer }));

  // Cadre les bornes au premier chargement.
  const cadre = useRef(false);
  useEffect(() => {
    if (cadre.current || bornes.length === 0) return;
    cadre.current = true;
    setTimeout(recentrer, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bornes.length]);

  const zoomer = (facteur: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    const r = region.current;
    carte.current?.animateToRegion(
      { ...r, latitudeDelta: Math.min(20, Math.max(0.002, r.latitudeDelta * facteur)), longitudeDelta: Math.min(20, Math.max(0.002, r.longitudeDelta * facteur)) },
      250
    );
  };

  const maPosition = async () => {
    Haptics.selectionAsync().catch(() => undefined);
    try {
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      carte.current?.animateToRegion({ latitude: p.coords.latitude, longitude: p.coords.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 600);
    } catch {
      // Position indisponible : on reste où l'on est.
    }
  };

  const surAppui = (e: MapPressEvent) => {
    if (appuiBorne.current || e.nativeEvent.action === 'marker-press') {
      appuiBorne.current = false;
      return;
    }
    onChoisir(null);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={carte}
        style={StyleSheet.absoluteFill}
        initialRegion={TUNISIE}
        mapType={satellite ? 'hybrid' : 'standard'}
        userInterfaceStyle="dark"
        showsUserLocation={gps}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest
        showsBuildings
        showsTraffic={!satellite}
        pitchEnabled
        onRegionChangeComplete={(r) => (region.current = r)}
        onPress={surAppui}>
        {affichees.map((b) => (
          <Marker
            key={`${b.id}-${b.etat}-${choisie === b.id}`}
            coordinate={{ latitude: b.latitude, longitude: b.longitude }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            zIndex={choisie === b.id ? 50 : b.etat === 'disponible' ? 10 : 5}
            onPress={() => {
              appuiBorne.current = true;
              Haptics.selectionAsync().catch(() => undefined);
              onChoisir(b.id);
              carte.current?.animateCamera({ center: { latitude: b.latitude, longitude: b.longitude } }, { duration: 400 });
            }}>
            <Pastille borne={b} active={choisie === b.id} />
          </Marker>
        ))}
      </MapView>

      <View style={[styles.commandes, { top: haut + 12 }]}>
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
        {gps && (
          <Pressable accessibilityRole="button" accessibilityLabel="Centrer sur ma position" onPress={maPosition} style={styles.commande}>
            <Icone name="crosshairs-gps" size={22} color="#FFFFFF" />
          </Pressable>
        )}
        <View style={styles.zoom}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoomer" onPress={() => zoomer(0.4)} style={styles.zoomBouton}>
            <Icone name="plus" size={26} color="#FFFFFF" />
          </Pressable>
          <View style={styles.trait} />
          <Pressable accessibilityRole="button" accessibilityLabel="Dézoomer" onPress={() => zoomer(2.5)} style={styles.zoomBouton}>
            <Icone name="minus" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bulle: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 2 },
  queue: { width: 2, height: 8, marginTop: -1 },
  commandes: { position: 'absolute', right: 14, gap: 10, alignItems: 'flex-end' },
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
  zoom: { width: 52, borderRadius: 16, backgroundColor: '#121215E6', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF33', overflow: 'hidden' },
  zoomBouton: { height: 52, alignItems: 'center', justifyContent: 'center' },
  trait: { height: StyleSheet.hairlineWidth, backgroundColor: '#FFFFFF33' },
});
