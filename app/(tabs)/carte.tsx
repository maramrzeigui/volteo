import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BorneCard } from '@/components/borne-card';
import { CarteBornes, type CarteBornesRef } from '@/components/carte/carte-bornes';
import { Pastille } from '@/components/ui/pastille';
import { Texte } from '@/components/ui/texte';
import { Colors, EtatBorneCouleurs, Rayons } from '@/constants/theme';
import { useFavoris } from '@/hooks/use-favoris';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import type { Borne } from '@/types/domain';

type Filtre = 'toutes' | 'libres' | 'rapides' | 'favoris';

/**
 * Carte web (iframe Leaflet, Plan ou Satellite) ; sur iPhone et Android, carte native (CarteBornes).
 * Marqueurs en pastilles « 60 kW » colorées selon l'état ; filtrage et
 * sélection pilotés depuis React Native sans recharger la page.
 */
function pageCarte(bornes: Borne[], scheme: 'light' | 'dark') {
  const c = Colors[scheme];
  const marqueurs = bornes.map((b) => {
    const info = EtatBorneCouleurs[b.etat] ?? { couleur: 'neutral' as const };
    return {
      id: b.id,
      lat: b.latitude,
      lng: b.longitude,
      couleur: c[info.couleur],
      publique: b.source === 'publique',
      texte: b.source === 'publique' ? (b.operateur ?? 'Public') : `${b.puissanceKw ?? '—'} kW`,
      libre: b.etat === 'disponible',
    };
  });

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<style>
  html, body, #map { margin: 0; height: 100%; background: ${c.background}; }
  .leaflet-control-attribution { font: 10px system-ui; background: ${c.surface}cc !important; color: ${c.textMuted}; }
  .leaflet-control-attribution a { color: ${c.textMuted}; }
  .pin { transform: translate(-50%, -100%); display: inline-flex; flex-direction: column; align-items: center;
         transition: transform .2s ease, opacity .25s ease; }
  .bulle { font: 700 12px/1 -apple-system, system-ui, sans-serif; letter-spacing: -.2px; white-space: nowrap;
           padding: 7px 10px; border-radius: 999px; color: #fff; box-shadow: 0 4px 14px rgba(11,27,46,.28);
           border: 2px solid ${c.surface}; }
  .queue { width: 2px; height: 8px; margin-top: -1px; }
  .pin.publique .bulle { background: ${c.surface} !important; color: ${c.textMuted}; border-color: ${c.border}; font-weight: 600; }
  .pin.publique .queue { background: ${c.border} !important; }
  .pin.actif { transform: translate(-50%, -100%) scale(1.18); z-index: 1000; }
  .pin.actif .bulle { box-shadow: 0 0 0 4px ${c.primary}55, 0 6px 18px rgba(11,27,46,.35); }
  .groupe { transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: 6px;
            font: 700 12px/1 -apple-system, system-ui, sans-serif; white-space: nowrap; color: ${c.onInk};
            background: ${c.ink}; padding: 8px 12px; border-radius: 999px; border: 2px solid ${c.surface};
            box-shadow: 0 6px 16px rgba(11,27,46,.35); }
  .groupe b { color: ${c.primary}; }
</style></head><body>
<div id="map"></div>
<script>
  const bornes = ${JSON.stringify(marqueurs)};
  const envoyer = (msg) => {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
    else window.parent.postMessage({ borneApp: msg }, '*');
  };
  const map = L.map('map', { zoomControl: false });
  // Vraie carte (couleurs réelles) + vue satellite, comme une appli de cartes.
  const plan = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 });
  const satellite = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri', maxZoom: 19 }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
  ]);
  plan.addTo(map);
  L.control.layers({ 'Plan': plan, 'Satellite': satellite }, null, { position: 'topright' }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Regroupe les bornes proches : pastille « N bornes (dont X libres) », ouverte au zoom.
  const groupe = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 48,
    spiderfyDistanceMultiplier: 1.8,
    iconCreateFunction: (cluster) => {
      const enfants = cluster.getAllChildMarkers();
      const libres = enfants.filter((m) => m.options.libre).length;
      return L.divIcon({
        className: '',
        html: '<div class="groupe">' + enfants.length + ' bornes'
          + (libres ? ' · <b>' + libres + ' libre' + (libres > 1 ? 's' : '') + '</b>' : '') + '</div>',
        iconSize: [0, 0],
      });
    },
  });
  const tous = {};
  const elements = {};
  bornes.forEach((b) => {
    const html = '<div class="pin' + (b.publique ? ' publique' : '') + '" data-id="' + b.id + '">'
      + '<div class="bulle" style="background:' + b.couleur + '">' + b.texte + '</div>'
      + '<div class="queue" style="background:' + b.couleur + '"></div></div>';
    const m = L.marker([b.lat, b.lng], {
      icon: L.divIcon({ className: '', html, iconSize: [0, 0], iconAnchor: [0, 0] }),
      riseOnHover: true,
      libre: b.libre,
    });
    m.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      selectionner(b.id);
      map.panTo([b.lat, b.lng], { animate: true });
      envoyer(String(b.id));
    });
    elements[b.id] = m;
    tous[b.id] = m;
  });
  groupe.addLayers(Object.values(tous));
  map.addLayer(groupe);

  const pin = (id) => elements[id]?.getElement()?.querySelector('.pin');
  function selectionner(id) {
    Object.keys(elements).forEach((cle) => pin(cle)?.classList.toggle('actif', Number(cle) === id));
  }
  window.filtrer = (visibles) => {
    groupe.clearLayers();
    groupe.addLayers(visibles.map((id) => tous[id]).filter(Boolean));
  };
  map.on('click', () => { selectionner(null); envoyer('aucune'); });
  window.recentrer = () => {
    if (bornes.length) map.fitBounds(groupe.getBounds().pad(0.2), { animate: true });
    else map.setView([34.9, 9.9], 6);
  };
  window.recentrer();
</script></body></html>`;
}

export default function CarteScreen() {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { ids: favoris } = useFavoris();
  const [bornes, setBornes] = useState<Borne[]>([]);
  const [choisie, setChoisie] = useState<Borne | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const natif = useRef<CarteBornesRef>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .listeBornes()
        .then((b) => setBornes((avant) => (JSON.stringify(avant) === JSON.stringify(b) ? avant : b)))
        .catch(() => undefined);
    }, [])
  );

  const html = useMemo(() => pageCarte(bornes, scheme), [bornes, scheme]);

  const tests: Record<Filtre, (b: Borne) => boolean> = useMemo(
    () => ({
      toutes: () => true,
      libres: (b) => b.etat === 'disponible',
      rapides: (b) => b.source === 'reseau' && (b.puissanceKw ?? 0) >= 50,
      favoris: (b) => favoris.has(b.id),
    }),
    [favoris]
  );
  const visibles = useMemo(() => bornes.filter(tests[filtre]).map((b) => b.id), [bornes, tests, filtre]);

  const executer = useCallback((script: string) => {
    if (Platform.OS === 'web') {
      const fenetre = iframeRef.current?.contentWindow as unknown as { eval?: (s: string) => void } | null;
      try {
        fenetre?.eval?.(script);
      } catch {
        // Page de carte pas encore prête : le filtre sera réappliqué à son chargement.
      }
    }
  }, []);

  const appliquerFiltre = useCallback(
    () => executer(`window.filtrer && window.filtrer(${JSON.stringify(visibles)})`),
    [executer, visibles]
  );

  useEffect(() => {
    appliquerFiltre();
    if (choisie && !visibles.includes(choisie.id)) setChoisie(null);
  }, [appliquerFiltre, visibles, choisie]);

  const recevoir = useCallback(
    (message: string) => {
      const id = Number(message);
      setChoisie(id ? (bornes.find((b) => b.id === id) ?? null) : null);
    },
    [bornes]
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const ecouter = (e: MessageEvent) => {
      if (e.data && typeof e.data.borneApp === 'string') recevoir(e.data.borneApp);
    };
    window.addEventListener('message', ecouter);
    return () => window.removeEventListener('message', ecouter);
  }, [recevoir]);

  const libres = bornes.filter((b) => b.etat === 'disponible').length;
  const LIBELLES: Record<Filtre, string> = {
    toutes: 'Toutes',
    libres: 'Libres',
    rapides: 'Charge rapide',
    favoris: 'Favoris',
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {Platform.OS === 'web' ? (
        <iframe
          ref={iframeRef}
          title="Carte des bornes"
          srcDoc={html}
          onLoad={appliquerFiltre}
          style={{ border: 0, width: '100%', height: '100%' }}
        />
      ) : (
        <CarteBornes
          ref={natif}
          bornes={bornes}
          visibles={visibles}
          choisie={choisie?.id ?? null}
          onChoisir={(id) => recevoir(id ? String(id) : 'aucune')}
          haut={insets.top + 120}
        />
      )}

      <View pointerEvents="box-none" style={[styles.haut, { top: insets.top + 12 }]}>
        <View style={[styles.resume, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ flex: 1 }}>
            <Texte variant="subheading">
              {libres} borne{libres > 1 ? 's' : ''} libre{libres > 1 ? 's' : ''}
            </Texte>
            <Texte variant="caption" color="textMuted">
              sur {bornes.length} référencées en Tunisie
            </Texte>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => (Platform.OS === 'web' ? executer('window.recentrer()') : natif.current?.recentrer())}
            hitSlop={8}
            style={[styles.recentrer, { backgroundColor: c.surfaceAlt }]}>
            <Texte variant="captionStrong">Recentrer</Texte>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtres}>
          {(Object.keys(LIBELLES) as Filtre[]).map((f) => (
            <Pastille
              key={f}
              libelle={LIBELLES[f]}
              compteur={bornes.filter(tests[f]).length}
              actif={filtre === f}
              onPress={() => setFiltre(f)}
            />
          ))}
        </ScrollView>
      </View>

      {choisie && (
        <Animated.View
          key={choisie.id}
          entering={FadeInDown.springify().damping(18)}
          exiting={FadeOutDown.duration(160)}
          style={styles.fiche}>
          <BorneCard borne={choisie} favori={favoris.has(choisie.id)} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  haut: { position: 'absolute', left: 0, right: 0, gap: 10 },
  resume: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: Rayons.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#0D0D10',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  recentrer: { borderRadius: Rayons.pill, paddingHorizontal: 14, height: 34, justifyContent: 'center' },
  filtres: { paddingHorizontal: 16, gap: 8 },
  fiche: { position: 'absolute', left: 16, right: 16, bottom: 16 },
});
