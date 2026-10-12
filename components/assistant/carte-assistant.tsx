import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { EtatBadge } from '@/components/etat-badge';
import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuree, formatNombre, formatPrix } from '@/lib/format';
import type { CarteAssistant } from '@/types/domain';

function Cadre({
  icone,
  children,
  onPress,
  libelle,
  rang,
}: {
  icone: NomIcone;
  children: React.ReactNode;
  onPress?: () => void;
  libelle: string;
  rang: number;
}) {
  const { c } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(120 + rang * 70).duration(380)}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={libelle}
        disabled={!onPress}
        onPress={onPress}
        style={({ pressed }) => [
          styles.cadre,
          { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.85 : 1 },
        ]}>
        <View style={[styles.icone, { backgroundColor: c.primarySoft }]}>
          <Icone name={icone} size={20} color="primary" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>{children}</View>
        {onPress && <Icone name="chevron-right" size={20} color="textFaint" />}
      </Pressable>
    </Animated.View>
  );
}

function Mesure({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <View style={{ gap: 1 }}>
      <Texte variant="bodyStrong">{valeur}</Texte>
      <Texte variant="caption" color="textMuted">
        {libelle}
      </Texte>
    </View>
  );
}

/** Carte riche renvoyée par un outil de l'assistant : touchable pour ouvrir l'écran concerné. */
export function CarteResultat({ carte, rang = 0 }: { carte: CarteAssistant; rang?: number }) {
  switch (carte.type) {
    case 'borne': {
      const publique = carte.source === 'publique';
      return (
        <Cadre
          rang={rang}
          icone="ev-station"
          libelle={`Ouvrir ${carte.nom}`}
          onPress={() => router.push({ pathname: '/borne/[id]', params: { id: String(carte.borneId) } })}>
          <View style={styles.ligne}>
            <Texte variant="subheading" numberOfLines={1} style={{ flex: 1 }}>
              {carte.nom}
            </Texte>
            <EtatBadge etat={publique ? 'inconnu' : carte.etat} />
          </View>
          <Texte variant="caption" color="textMuted" numberOfLines={1}>
            {carte.distanceKm != null ? `${formatNombre(carte.distanceKm, 1)} km · ` : ''}
            {carte.adresse}
          </Texte>
          <View style={styles.mesures}>
            {carte.puissanceKw != null && <Mesure valeur={`${carte.puissanceKw} kW`} libelle="max" />}
            {!publique && <Mesure valeur={`${carte.priseLibres}/${carte.prisesTotal}`} libelle="prises libres" />}
            {carte.tarif && <Mesure valeur={carte.tarif} libelle="tarif" />}
          </View>
        </Cadre>
      );
    }
    case 'estimation':
      return (
        <Cadre
          rang={rang}
          icone="calculator-variant-outline"
          libelle={`Estimation sur ${carte.borneNom}`}
          onPress={() => router.push({ pathname: '/borne/[id]', params: { id: String(carte.borneId) } })}>
          <Texte variant="caption" color="textMuted" numberOfLines={1}>
            {carte.borneNom} · {carte.prise}
          </Texte>
          <Texte variant="title" color="copper">
            ≈ {formatPrix(carte.prix)}
          </Texte>
          <View style={styles.mesures}>
            <Mesure valeur={`${formatNombre(carte.energieKwh, 1)} kWh`} libelle="énergie" />
            <Mesure valeur={formatDuree(carte.dureeMinutes)} libelle="durée estimée" />
            {carte.remisePourcent > 0 && <Mesure valeur={`−${carte.remisePourcent} %`} libelle="abonnement" />}
            {carte.kwhOfferts > 0 && <Mesure valeur={`${formatNombre(carte.kwhOfferts, 1)} kWh`} libelle="offerts" />}
          </View>
        </Cadre>
      );
    case 'compte':
      return (
        <Cadre rang={rang} icone="wallet-outline" libelle="Ouvrir mon compte" onPress={() => router.push('/profil')}>
          <View style={styles.mesures}>
            <Mesure valeur={formatPrix(carte.soldeWallet)} libelle="solde du wallet" />
            {carte.aRegler > 0 && <Mesure valeur={formatPrix(carte.aRegler)} libelle="à régler" />}
            <Mesure valeur={carte.abonnement ?? 'Aucun'} libelle="abonnement" />
            {carte.kwhRestants != null && <Mesure valeur={`${formatNombre(carte.kwhRestants, 1)} kWh`} libelle="inclus restants" />}
          </View>
        </Cadre>
      );
    case 'recharge':
      return (
        <Cadre rang={rang} icone="battery-charging" libelle="Suivre ma recharge" onPress={() => router.push('/recharge')}>
          <Texte variant="subheading">{carte.enPause ? 'Recharge en pause' : 'Recharge en cours'}</Texte>
          <Texte variant="caption" color="textMuted">
            {carte.borneNom}
          </Texte>
          <View style={styles.mesures}>
            {carte.batterie != null && <Mesure valeur={`${carte.batterie} %`} libelle="batterie" />}
            <Mesure valeur={`${formatNombre(carte.energieKwh, 1)} kWh`} libelle="énergie" />
            {carte.puissanceKw != null && <Mesure valeur={`${formatNombre(carte.puissanceKw, 0)} kW`} libelle="puissance" />}
            <Mesure valeur={formatPrix(carte.prix)} libelle="coût" />
          </View>
        </Cadre>
      );
  }
}

const styles = StyleSheet.create({
  cadre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espace.md,
    padding: Espace.md,
    borderRadius: Rayons.lg,
    borderWidth: 1,
  },
  icone: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mesures: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 6, marginTop: 2 },
});
