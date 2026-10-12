import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NOM_PRISE } from '@/components/borne-card';
import { BarreBatterie } from '@/components/ui/barre-batterie';
import { Bouton } from '@/components/ui/bouton';
import { Carte } from '@/components/ui/carte';
import { ChiffreAnime } from '@/components/ui/chiffre-anime';
import { CourbePuissance } from '@/components/ui/courbe-puissance';
import { Texte } from '@/components/ui/texte';
import { Espace } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { informer } from '@/lib/dialogue';
import { ouvrirFacture } from '@/lib/factures';
import { formatDuree, formatHeure, formatNombre, formatPrix } from '@/lib/format';
import { STATUT_PAIEMENT } from '@/lib/libelles';
import type { Facture, Mesure, SessionRecharge } from '@/types/domain';

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={styles.ligne}>
      <Texte variant="body" color="textMuted">
        {libelle}
      </Texte>
      <Texte variant="bodyStrong" style={styles.chiffres}>
        {valeur}
      </Texte>
    </View>
  );
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  const [session, setSession] = useState<SessionRecharge | null>(null);
  const [mesures, setMesures] = useState<Mesure[]>([]);
  const [facture, setFacture] = useState<Facture | null>(null);
  const [telechargement, setTelechargement] = useState(false);

  useEffect(() => {
    const sessionId = Number(id);
    Promise.all([api.listeSessions(), api.mesuresSession(sessionId), api.listeFactures()])
      .then(([sessions, m, factures]) => {
        setSession(sessions.find((s) => s.id === sessionId) ?? null);
        setMesures(m);
        setFacture(factures.find((f) => f.sessionId === sessionId) ?? null);
      })
      .catch(() => undefined);
  }, [id]);

  if (!session) {
    return (
      <View style={[styles.chargement, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const debut = mesures.find((m) => m.pourcentageBatterie != null)?.pourcentageBatterie ?? null;
  const fin = session.pourcentageBatterie;
  const puissances = mesures.map((m) => m.puissanceKw ?? 0);
  const moyenne = puissances.length ? puissances.reduce((a, b) => a + b, 0) / puissances.length : null;
  const date = new Date(session.dateDebut);

  const telecharger = async () => {
    if (!facture) return;
    setTelechargement(true);
    try {
      await ouvrirFacture(facture);
    } catch (e) {
      informer('Téléchargement impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    } finally {
      setTelechargement(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.contenu, { paddingTop: insets.top + Espace.sm, paddingBottom: insets.bottom + Espace.xxl }]}>
      <View style={styles.barre}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
          <Texte variant="bodyStrong" color="textMuted">
            Retour
          </Texte>
        </Pressable>
        {facture && (
          <Texte variant="captionStrong" color="textMuted">
            {facture.numero}
          </Texte>
        )}
      </View>

      <Animated.View entering={FadeInDown.duration(450)} style={{ gap: 4 }}>
        <Texte variant="label" color="textMuted">
          {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
          {formatHeure(session.dateDebut)}
        </Texte>
        <Texte variant="title">{session.borneNom}</Texte>
        <Texte variant="body" color="textMuted">
          {NOM_PRISE[session.typeConnecteur]} · {formatDuree(session.dureeMinutes)}
          {session.etat === 'annulee' ? ' · annulée' : ''}
        </Texte>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(450)}>
        <Carte style={styles.chiffresCles}>
          <View style={styles.cle}>
            <ChiffreAnime valeur={session.energieKwh} decimales={1} variant="title" unite="kWh" />
            <Texte variant="label" color="textMuted">Énergie</Texte>
          </View>
          <View style={[styles.separateur, { backgroundColor: c.border }]} />
          <View style={styles.cle}>
            <ChiffreAnime valeur={session.prix} decimales={2} variant="title" color="copper" unite="DT" />
            <Texte variant="label" color="textMuted">Montant</Texte>
          </View>
          <View style={[styles.separateur, { backgroundColor: c.border }]} />
          <View style={styles.cle}>
            <ChiffreAnime valeur={moyenne} variant="title" unite="kW" />
            <Texte variant="label" color="textMuted">Moyenne</Texte>
          </View>
        </Carte>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(450)}>
        <Carte style={{ gap: Espace.md }}>
          <View style={styles.titreBloc}>
            <Texte variant="subheading">Courbe de puissance</Texte>
            <Texte variant="caption" color="textMuted">
              {mesures.length} mesures
            </Texte>
          </View>
          <CourbePuissance
            mesures={mesures}
            couleur={c.primary}
            couleurGrille={c.border}
            couleurTexte={c.textMuted}
          />
          <Texte variant="caption" color="textMuted">
            La puissance baisse en fin de charge : la batterie se protège au-delà de 80 %.
          </Texte>
        </Carte>
      </Animated.View>

      {debut != null && fin != null && (
        <Animated.View entering={FadeInDown.delay(300).duration(450)}>
          <Carte style={{ gap: Espace.md }}>
            <View style={styles.titreBloc}>
              <Texte variant="subheading">Batterie</Texte>
              <Texte variant="bodyStrong" style={styles.chiffres}>
                {debut} % → {fin} %
              </Texte>
            </View>
            <BarreBatterie pourcentage={fin} couleur={c.primary} couleurPiste={c.surfaceAlt} />
          </Carte>
        </Animated.View>
      )}

      <Carte style={{ gap: 12 }}>
        <Ligne libelle="Début" valeur={formatHeure(session.dateDebut)} />
        {session.dateFin && <Ligne libelle="Fin" valeur={formatHeure(session.dateFin)} />}
        <Ligne
          libelle="Prix moyen"
          valeur={session.energieKwh > 0 ? `${formatNombre(session.prix / session.energieKwh, 3)} DT/kWh` : '—'}
        />
        {session.paiementStatut && (
          <Ligne libelle="Paiement" valeur={STATUT_PAIEMENT[session.paiementStatut]?.label ?? session.paiementStatut} />
        )}
      </Carte>

      {session.paiementStatut === 'en_attente' && (
        <Carte style={{ ...styles.aRegler, borderColor: c.warning }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Texte variant="subheading">{formatPrix(session.prix)} à régler</Texte>
            <Texte variant="caption" color="textMuted">
              Solde insuffisant à la fin de la recharge : paiement différé.
            </Texte>
          </View>
          <Bouton titre="Régler" taille="compact" onPress={() => router.push('/compte/paiements')} />
        </Carte>
      )}

      {facture && (
        <Bouton titre="Télécharger la facture (PDF)" variante="secondaire" chargement={telechargement} onPress={telecharger} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chargement: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contenu: { paddingHorizontal: Espace.xl, gap: Espace.lg },
  barre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 44 },
  chiffresCles: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20 },
  cle: { flex: 1, alignItems: 'center', gap: 2 },
  separateur: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  titreBloc: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  ligne: { flexDirection: 'row', justifyContent: 'space-between' },
  chiffres: { fontVariant: ['tabular-nums'] },
  aRegler: { flexDirection: 'row', alignItems: 'center', gap: Espace.md, borderWidth: 1.5 },
});
