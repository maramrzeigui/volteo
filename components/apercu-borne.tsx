import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { NOM_PRISE } from '@/components/borne-card';
import { EtatBadge } from '@/components/etat-badge';
import { PhotoBorneIllustree } from '@/components/illustrations/photo-borne';
import { Icone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { urlMedia } from '@/lib/api';
import { libelleTarif, tarifDeBorne } from '@/lib/tarifs';
import type { Borne } from '@/types/domain';

/**
 * Aperçu d'une borne en popup transparente (verre dépoli) : photo, état, puissance,
 * prix et prises, avec deux grandes actions claires.
 */
export function ApercuBorne({ borne, onFermer }: { borne: Borne | null; onFermer: () => void }) {
  const [erreur, setErreur] = useState(false);
  if (!borne) return null;
  const photo = !erreur ? urlMedia(borne.photoUrl) : null;
  const tarif = borne.source === 'reseau' ? libelleTarif(tarifDeBorne(borne)) : null;
  const prises = [...new Set(borne.connecteurs.map((x) => x.type))];
  const libres = borne.connecteurs.filter((x) => x.etat === 'disponible').length;

  const aller = (action: () => void) => {
    onFermer();
    setTimeout(action, 150);
  };

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onFermer}>
      <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={[StyleSheet.absoluteFill, styles.voile]} onPress={onFermer} accessibilityLabel="Fermer" />
      </Animated.View>

      <View style={styles.centre} pointerEvents="box-none">
        <Animated.View entering={FadeIn.duration(150)} style={styles.carte}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.teinte} />

          <View style={styles.photo}>
            {photo ? (
              <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} onError={() => setErreur(true)} />
            ) : (
              <PhotoBorneIllustree id={borne.id} rapide={(borne.puissanceKw ?? 0) >= 50} />
            )}
            <LinearGradient colors={['#00000000', '#0D0D10CC']} style={StyleSheet.absoluteFill} />
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onFermer} style={styles.croix}>
              <Icone name="close" size={22} color="#FFFFFF" />
            </Pressable>
            {photo && borne.photoCredit && (
              <Texte variant="caption" color="#FFFFFF99" style={styles.credit} numberOfLines={1}>
                Photo © {borne.photoCredit}
              </Texte>
            )}
          </View>

          <View style={styles.corps}>
            <EtatBadge etat={borne.etat} surEncre />
            <Texte variant="title" numberOfLines={2}>
              {borne.nom}
            </Texte>
            <View style={styles.ligne}>
              <Icone name="map-marker-outline" size={18} color="textMuted" />
              <Texte variant="body" color="textMuted" style={{ flex: 1 }} numberOfLines={2}>
                {borne.adresse}
              </Texte>
            </View>

            <View style={[styles.chiffres, { borderColor: '#FFFFFF1F' }]}>
              <View style={styles.chiffre}>
                <Texte variant="number">{borne.puissanceKw ?? '—'}</Texte>
                <Texte variant="caption" color="textMuted">kW max</Texte>
              </View>
              {tarif && (
                <View style={styles.chiffre}>
                  <Texte variant="number" color="copper">
                    {tarif.montant}
                  </Texte>
                  <Texte variant="caption" color="textMuted">{tarif.unite}</Texte>
                </View>
              )}
              <View style={styles.chiffre}>
                <Texte variant="number">
                  {libres}/{borne.connecteurs.length}
                </Texte>
                <Texte variant="caption" color="textMuted">prises libres</Texte>
              </View>
            </View>

            {prises.length > 0 && (
              <Texte variant="body" color="textMuted">
                Prises : {prises.map((p) => NOM_PRISE[p] ?? p).join(', ')}
              </Texte>
            )}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => aller(() => router.push({ pathname: '/trajet', params: { borneId: String(borne.id) } }))}
                style={[styles.action, styles.actionPrincipale]}>
                <Icone name="navigation-variant" size={22} color="#FFFFFF" />
                <Texte variant="bodyStrong" color="#FFFFFF">
                  Y aller
                </Texte>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => aller(() => router.push({ pathname: '/borne/[id]', params: { id: String(borne.id) } }))}
                style={[styles.action, styles.actionSecondaire]}>
                <Icone name="ev-station" size={22} color="#FFFFFF" />
                <Texte variant="bodyStrong" color="#FFFFFF">
                  Voir la borne
                </Texte>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  voile: { backgroundColor: '#0505074D' },
  centre: { flex: 1, justifyContent: 'center', padding: Espace.lg },
  carte: { borderRadius: Rayons.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF33' },
  teinte: { ...StyleSheet.absoluteFillObject, backgroundColor: '#16161A99' },
  photo: { height: 190, backgroundColor: '#0D0D10' },
  croix: { position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: '#0D0D10AA', alignItems: 'center', justifyContent: 'center' },
  credit: { position: 'absolute', left: 12, bottom: 8, fontSize: 9, lineHeight: 12 },
  corps: { padding: Espace.lg, gap: 10 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chiffres: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12, marginVertical: 4 },
  chiffre: { flex: 1, alignItems: 'center', gap: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  action: { flex: 1, height: 56, borderRadius: Rayons.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionPrincipale: { backgroundColor: '#B83A46' },
  actionSecondaire: { backgroundColor: '#FFFFFF1F', borderWidth: 1, borderColor: '#FFFFFF33' },
});
