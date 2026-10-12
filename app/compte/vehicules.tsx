import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NOM_PRISE } from '@/components/borne-card';
import { Bouton } from '@/components/ui/bouton';
import { Carte } from '@/components/ui/carte';
import { Icone, ICONE_CONNECTEUR } from '@/components/ui/icone';
import { Squelette } from '@/components/ui/squelette';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { confirmer, informer } from '@/lib/dialogue';
import { autonomieKm } from '@/lib/estimation';
import type { Vehicule } from '@/types/domain';

/** Module 8 — véhicules du client : marque, modèle, immatriculation, connecteur, batterie. */
export default function VehiculesScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [vehicules, setVehicules] = useState<Vehicule[] | null>(null);

  const charger = useCallback(() => {
    api
      .listeVehicules()
      .then(setVehicules)
      .catch(() => setVehicules([]));
  }, []);

  useFocusEffect(charger);

  const supprimer = async (v: Vehicule) => {
    const ok = await confirmer(`Supprimer ${v.marque} ${v.modele} ?`, 'Votre historique de recharges est conservé.', {
      confirmer: 'Supprimer',
      destructif: true,
    });
    if (!ok) return;
    try {
      await api.supprimerVehicule(v.id);
      charger();
    } catch (e) {
      informer('Suppression impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.contenu, { paddingBottom: insets.bottom + Espace.xxl }]}>
      <Texte variant="body" color="textMuted">
        Le véhicule principal sert aux estimations de durée et de prix, et accompagne vos recharges.
      </Texte>

      {vehicules === null ? (
        [0, 1].map((i) => <Squelette key={i} hauteur={120} rayon={Rayons.lg} />)
      ) : vehicules.length === 0 ? (
        <Carte style={styles.vide}>
          <Icone name="car-electric-outline" size={40} color="textFaint" />
          <Texte variant="subheading">Aucun véhicule</Texte>
          <Texte variant="caption" color="textMuted" align="center">
            Ajoutez votre véhicule électrique pour des estimations adaptées à sa batterie.
          </Texte>
        </Carte>
      ) : (
        vehicules.map((v, i) => (
          <Animated.View key={v.id} entering={FadeInDown.delay(i * 70).duration(400)}>
            <Carte style={styles.carte}>
              <View style={styles.haut}>
                <View style={[styles.icone, { backgroundColor: c.primarySoft }]}>
                  <Icone name={ICONE_CONNECTEUR[v.typeConnecteur] ?? 'ev-plug-type2'} size={24} color="primary" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Texte variant="subheading" numberOfLines={1}>
                    {v.marque} {v.modele}
                  </Texte>
                  <Texte variant="caption" color="textMuted">
                    {NOM_PRISE[v.typeConnecteur] ?? v.typeConnecteur} · {v.capaciteBatterieKwh} kWh · ≈{' '}
                    {autonomieKm(100, v.capaciteBatterieKwh)} km
                  </Texte>
                </View>
                <View style={[styles.plaque, { borderColor: c.border }]}>
                  <Texte variant="captionStrong" style={styles.chiffres}>
                    {v.immatriculation}
                  </Texte>
                </View>
              </View>
              {i === 0 && vehicules.length > 1 && (
                <Texte variant="label" color="primary">
                  Véhicule principal
                </Texte>
              )}
              <View style={styles.actions}>
                <Bouton
                  titre="Modifier"
                  icone="pencil-outline"
                  variante="secondaire"
                  taille="compact"
                  onPress={() => router.push({ pathname: '/compte/vehicule', params: { id: String(v.id) } })}
                  style={{ flex: 1 }}
                />
                <Bouton
                  titre="Supprimer"
                  icone="trash-can-outline"
                  variante="danger"
                  taille="compact"
                  onPress={() => supprimer(v)}
                  style={{ flex: 1 }}
                />
              </View>
            </Carte>
          </Animated.View>
        ))
      )}

      <Bouton titre="Ajouter un véhicule" icone="plus" onPress={() => router.push('/compte/vehicule')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenu: { padding: Espace.xl, gap: Espace.lg },
  vide: { alignItems: 'center', gap: Espace.sm, paddingVertical: Espace.xxl },
  carte: { gap: Espace.md },
  haut: { flexDirection: 'row', alignItems: 'center', gap: Espace.md },
  icone: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  plaque: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  actions: { flexDirection: 'row', gap: Espace.sm },
  chiffres: { fontVariant: ['tabular-nums'] },
});
