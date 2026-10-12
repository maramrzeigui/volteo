import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { borneIndisponible } from '@/components/borne-indisponible';
import { EtatBadge } from '@/components/etat-badge';
import { PhotoBorneIllustree } from '@/components/illustrations/photo-borne';
import { Carte } from '@/components/ui/carte';
import { Icone, ICONE_CONNECTEUR } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { urlMedia } from '@/lib/api';
import { libelleTarif, tarifDeBorne } from '@/lib/tarifs';
import type { Borne, Connecteur } from '@/types/domain';

export const NOM_PRISE: Record<string, string> = {
  CCS: 'CCS',
  Type2: 'Type 2',
  CHAdeMO: 'CHAdeMO',
  AC: 'AC',
  DC: 'DC',
};

/** Regroupe les prises identiques : « CCS · 1/2 » (aucune libre si la borne refuse les recharges). */
function regrouper(connecteurs: Connecteur[], borneIndisponible: boolean) {
  const groupes = new Map<string, { type: string; total: number; libres: number }>();
  for (const conn of connecteurs) {
    const g = groupes.get(conn.type) ?? { type: conn.type, total: 0, libres: 0 };
    g.total += 1;
    if (conn.etat === 'disponible' && !borneIndisponible) g.libres += 1;
    groupes.set(conn.type, g);
  }
  return [...groupes.values()];
}

type Props = {
  borne: Borne;
  favori?: boolean;
  /** Présentation compacte (carrousel, fiche flottante de la carte) : hauteur identique pour toutes. */
  compacte?: boolean;
  /** Action au toucher (par défaut : ouvrir la fiche de la borne). */
  onPress?: () => void;
};

/** Visuel de la borne : photo réelle si disponible, sinon illustration de nuit. */
function VisuelBorne({ borne, hauteur }: { borne: Borne; hauteur: number }) {
  const [erreur, setErreur] = useState(false);
  const photo = !erreur ? urlMedia(borne.photoUrl) : null;
  return (
    <View style={[styles.visuel, { height: hauteur }]}>
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
          accessibilityIgnoresInvertColors
          onError={() => setErreur(true)}
        />
      ) : (
        <PhotoBorneIllustree id={borne.id} rapide={(borne.puissanceKw ?? 0) >= 50} />
      )}
      {/* Fondu vers la carte pour que le texte reste lisible */}
      <LinearGradient colors={['#00000000', '#0000001A', '#1A1A1D']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      {photo && borne.photoCredit && (
        <Texte variant="caption" color="#FFFFFFAA" style={styles.credit} numberOfLines={1}>
          © {borne.photoCredit.split(' · ')[0]}
        </Texte>
      )}
    </View>
  );
}

export function BorneCard({ borne, favori = false, compacte = false, onPress }: Props) {
  const { c } = useTheme();
  const publique = borne.source === 'publique';
  const rapide = (borne.puissanceKw ?? 0) >= 50;
  const groupes = regrouper(borne.connecteurs, borneIndisponible(borne));
  const tarif = !publique ? libelleTarif(tarifDeBorne(borne)) : null;

  return (
    <Carte
      accessibilityLabel={`Ouvrir ${borne.nom}`}
      onPress={onPress ?? (() => router.push({ pathname: '/borne/[id]', params: { id: String(borne.id) } }))}
      style={styles.carte}>
      <VisuelBorne borne={borne} hauteur={compacte ? 112 : 150} />

      {/* Pastilles flottantes sur la photo */}
      <View style={styles.surPhoto}>
        <View style={styles.verre}>
          <EtatBadge etat={borne.etat} surEncre />
        </View>
        <View style={{ flex: 1 }} />
        {favori && (
          <View style={[styles.pastilleVerre, styles.rond]}>
            <Icone name="heart" size={15} color="primary" />
          </View>
        )}
        <View style={styles.pastilleVerre}>
          <Icone name={rapide ? 'lightning-bolt' : 'power-plug-outline'} size={14} color={rapide ? 'primary' : 'onInk'} />
          <Texte variant="captionStrong" color="onInk" style={styles.chiffres}>
            {borne.puissanceKw ?? '—'} kW
          </Texte>
        </View>
      </View>

      <View style={styles.corps}>
        <View style={styles.titres}>
          {(publique || rapide || compacte) && (
            // En carrousel, la ligne est toujours réservée : toutes les cartes ont la même hauteur.
            <Texte variant="label" color={publique ? 'textFaint' : 'primary'}>
              {publique ? (borne.operateur ?? 'Autre opérateur') : rapide ? 'Charge rapide' : 'Charge normale'}
            </Texte>
          )}
          <Texte variant="subheading" numberOfLines={1}>
            {borne.nom}
          </Texte>
          <View style={styles.ligne}>
            <Icone name="map-marker-outline" size={14} color="textFaint" />
            <Texte variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
              {borne.adresse}
            </Texte>
          </View>
        </View>

        {(groupes.length > 0 || tarif) && (
          <View style={[styles.bas, { borderTopColor: c.border }]}>
            <View style={[styles.prises, compacte && styles.prisesCompactes]}>
              {(compacte ? groupes.slice(0, 1) : groupes).map((g) => (
                <View key={g.type} style={[styles.prise, { backgroundColor: c.surfaceAlt }]}>
                  <Icone name={ICONE_CONNECTEUR[g.type as keyof typeof ICONE_CONNECTEUR] ?? 'ev-plug-type2'} size={14} color="textMuted" />
                  <Texte variant="captionStrong">{NOM_PRISE[g.type] ?? g.type}</Texte>
                  {!publique && (
                    <Texte variant="captionStrong" color={g.libres > 0 ? 'success' : 'textFaint'} style={styles.chiffres}>
                      {g.libres}/{g.total}
                    </Texte>
                  )}
                </View>
              ))}
            </View>
            {tarif && (
              <Texte variant="captionStrong" color="copper" style={styles.chiffres}>
                {tarif.montant}
                <Texte variant="caption" color="textMuted"> {tarif.unite}</Texte>
              </Texte>
            )}
          </View>
        )}
      </View>
    </Carte>
  );
}

const styles = StyleSheet.create({
  carte: { padding: 0, overflow: 'hidden' },
  visuel: { width: '100%', backgroundColor: '#0D0D10' },
  credit: { position: 'absolute', right: 10, bottom: 22, fontSize: 9, lineHeight: 12 },
  surPhoto: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  verre: { borderRadius: Rayons.pill, backgroundColor: '#0D0D1099', overflow: 'hidden' },
  pastilleVerre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: Rayons.pill,
    backgroundColor: '#0D0D10B3',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFFFFF26',
  },
  rond: { width: 28, paddingHorizontal: 0, justifyContent: 'center' },
  corps: { paddingHorizontal: 16, paddingBottom: 14, marginTop: -18, gap: 12 },
  titres: { gap: 3 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bas: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 8,
  },
  prises: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  prisesCompactes: { flexWrap: 'nowrap', overflow: 'hidden' },
  prise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Rayons.sm,
    paddingHorizontal: 9,
    height: 28,
  },
  chiffres: { fontVariant: ['tabular-nums'] },
});
