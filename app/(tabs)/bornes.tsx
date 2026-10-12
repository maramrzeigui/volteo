import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BorneCard } from '@/components/borne-card';
import { Champ } from '@/components/ui/champ';
import { Pastille } from '@/components/ui/pastille';
import { Squelette } from '@/components/ui/squelette';
import { Texte } from '@/components/ui/texte';
import { BarreTitreCompacte } from '@/components/ui/barre-titre-compacte';
import { Espace, Rayons } from '@/constants/theme';
import { useFavoris } from '@/hooks/use-favoris';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import type { Borne } from '@/types/domain';

type Filtre = 'toutes' | 'disponibles' | 'rapides' | 'favoris' | 'publiques';

/** Disponibles d'abord, puis en charge, le reste du réseau, et les bornes publiques en dernier. */
function rang(b: Borne) {
  if (b.source === 'publique') return 3;
  if (b.etat === 'disponible') return 0;
  if (b.etat === 'occupee') return 1;
  return 2;
}

export default function BornesScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { ids: favoris } = useFavoris();

  const [bornes, setBornes] = useState<Borne[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(async () => {
    setBornes(await api.listeBornes());
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger().catch(() => setBornes([]));
    }, [charger])
  );

  const filtres = useMemo<{ cle: Filtre; libelle: string; test: (b: Borne) => boolean }[]>(
    () => [
      { cle: 'toutes', libelle: 'Toutes', test: () => true },
      { cle: 'disponibles', libelle: 'Disponibles', test: (b) => b.etat === 'disponible' },
      { cle: 'rapides', libelle: 'Charge rapide', test: (b) => b.source === 'reseau' && (b.puissanceKw ?? 0) >= 50 },
      { cle: 'favoris', libelle: 'Favoris', test: (b) => favoris.has(b.id) },
      { cle: 'publiques', libelle: 'Autres réseaux', test: (b) => b.source === 'publique' },
    ],
    [favoris]
  );

  const liste = useMemo(() => bornes ?? [], [bornes]);
  const visibles = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    const test = filtres.find((f) => f.cle === filtre)!.test;
    return liste
      .filter(test)
      .filter(
        (b) =>
          !terme ||
          [b.nom, b.adresse, b.reference, b.operateur ?? ''].some((t) => t.toLowerCase().includes(terme))
      )
      .sort((a, b) => rang(a) - rang(b) || a.nom.localeCompare(b.nom));
  }, [liste, recherche, filtre, filtres]);

  const disponibles = liste.filter((b) => b.etat === 'disponible').length;

  const entete = (
    <View style={styles.entete}>
      <View style={{ gap: 2 }}>
        <Texte variant="title">Bornes</Texte>
        <Texte variant="body" color="textMuted">
          {bornes ? (
            <>
              {liste.length} en Tunisie ·{' '}
              <Texte variant="bodyStrong" color="success">
                {disponibles} libres maintenant
              </Texte>
            </>
          ) : (
            'Chargement du réseau…'
          )}
        </Texte>
      </View>
      <Champ
        label="Rechercher une borne"
        masquerLabel
        placeholder="Rechercher : ville, nom, opérateur"
        value={recherche}
        onChangeText={setRecherche}
        autoCorrect={false}
        returnKeyType="search"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtresConteneur}
        contentContainerStyle={styles.filtres}>
        {filtres.map((f) => (
          <Pastille
            key={f.cle}
            libelle={f.libelle}
            compteur={liste.filter(f.test).length}
            actif={filtre === f.cle}
            onPress={() => setFiltre(f.cle)}
          />
        ))}
      </ScrollView>
    </View>
  );

  // Le grand titre défile avec la liste ; une barre compacte prend le relais en haut.
  const defilement = useSharedValue(0);
  const surDefilement = useAnimatedScrollHandler((e) => {
    defilement.value = e.contentOffset.y;
  });

  return (
    <View style={{ flex: 1 }}>
      <Animated.FlatList
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.liste, { paddingTop: insets.top + Espace.lg }]}
        data={visibles}
        keyExtractor={(b) => String(b.id)}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 60).duration(420)}>
            <BorneCard borne={item} favori={favoris.has(item.id)} />
          </Animated.View>
        )}
        ListHeaderComponent={entete}
        ItemSeparatorComponent={() => <View style={{ height: Espace.md }} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          bornes ? (
            <View style={styles.vide}>
              <Texte variant="subheading">
                {filtre === 'favoris' ? 'Aucune borne favorite' : 'Aucune borne trouvée'}
              </Texte>
              <Texte variant="caption" color="textMuted" align="center">
                {filtre === 'favoris'
                  ? 'Ajoutez une borne à vos favoris depuis sa fiche pour la retrouver ici.'
                  : 'Essayez un autre mot-clé ou un autre filtre.'}
              </Texte>
            </View>
          ) : (
            <View style={{ gap: Espace.md }}>
              {[0, 1, 2].map((i) => (
                <Squelette key={i} hauteur={150} rayon={Rayons.lg} />
              ))}
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={rafraichissement}
            onRefresh={async () => {
              setRafraichissement(true);
              await charger().catch(() => undefined);
              setRafraichissement(false);
            }}
          />
        }
        onScroll={surDefilement}
        scrollEventThrottle={16}
      />
      <BarreTitreCompacte titre="Bornes" defilement={defilement} />
    </View>
  );
}

const styles = StyleSheet.create({
  liste: { paddingHorizontal: Espace.xl, paddingBottom: Espace.xxxl },
  entete: { gap: Espace.lg, marginBottom: Espace.lg },
  filtresConteneur: { marginHorizontal: -Espace.xl },
  filtres: { paddingHorizontal: Espace.xl, gap: Espace.sm },
  vide: { alignItems: 'center', gap: Espace.sm, paddingVertical: Espace.xxxl },
});
