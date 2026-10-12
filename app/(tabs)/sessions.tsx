import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Carte } from '@/components/ui/carte';
import { Icone, type NomIcone } from '@/components/ui/icone';
import { Squelette } from '@/components/ui/squelette';
import { Texte } from '@/components/ui/texte';
import { BarreTitreCompacte } from '@/components/ui/barre-titre-compacte';
import { Espace, Rayons, type CouleurSemantique } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { capitaliser, formatHeure, formatMois, formatNombre, formatPrix } from '@/lib/format';
import type { EtatSession, KpisClient, SessionRecharge } from '@/types/domain';

const ETAT_SESSION: Record<EtatSession, { label: string; icone: NomIcone; couleur: CouleurSemantique }> = {
  en_cours: { label: 'En cours de recharge', icone: 'lightning-bolt', couleur: 'primary' },
  en_pause: { label: 'En pause', icone: 'pause-circle-outline', couleur: 'warning' },
  terminee: { label: 'Terminée', icone: 'check-circle-outline', couleur: 'success' },
  annulee: { label: 'Annulée', icone: 'close-circle-outline', couleur: 'neutral' },
};

/** Une recharge, en langage simple : date complète, lieu, prix payé, état écrit en toutes lettres. */
function LigneSession({ session, kwhAux100Km }: { session: SessionRecharge; kwhAux100Km: number }) {
  const { c } = useTheme();
  const date = new Date(session.dateDebut);
  const etat = ETAT_SESSION[session.etat];
  const annulee = session.etat === 'annulee';
  const aRegler = session.paiementStatut === 'en_attente';
  const km = Math.round((session.energieKwh / kwhAux100Km) * 100);
  const jour = capitaliser(date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));

  return (
    <Carte
      style={styles.ligne}
      accessibilityLabel={`Recharge du ${jour} à ${session.borneNom}, ${formatPrix(session.prix)}. Voir le détail`}
      onPress={() =>
        session.etat === 'en_cours' || session.etat === 'en_pause'
          ? router.push('/recharge')
          : router.push({ pathname: '/session/[id]', params: { id: String(session.id) } })
      }>
      <View style={styles.ligneHaut}>
        <View style={[styles.pastille, { backgroundColor: c.primarySoft }]}>
          <Icone name="ev-station" size={22} color="primary" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Texte variant="bodyStrong" numberOfLines={1}>
            {jour}
          </Texte>
          <Texte variant="body" color="textMuted" numberOfLines={1}>
            {session.borneNom} · {formatHeure(session.dateDebut)}
          </Texte>
        </View>
        <Icone name="chevron-right" size={24} color="textFaint" />
      </View>

      <View style={[styles.ligneBas, { borderTopColor: c.border }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Texte variant="caption" color="textMuted">
            {annulee ? 'Rien à payer' : aRegler ? 'À payer' : 'Payé'}
          </Texte>
          <Texte variant="heading" color={annulee ? 'textFaint' : 'copper'} style={styles.chiffres}>
            {formatPrix(session.prix)}
          </Texte>
        </View>
        {!annulee && km > 0 && (
          <View style={{ flex: 1, gap: 2 }}>
            <Texte variant="caption" color="textMuted">
              Autonomie ajoutée
            </Texte>
            <Texte variant="heading" style={styles.chiffres}>
              ≈ {km} km
            </Texte>
          </View>
        )}
      </View>

      <View style={styles.etat}>
        <Icone name={aRegler ? 'alert-circle-outline' : etat.icone} size={18} color={aRegler ? 'warning' : etat.couleur} />
        <Texte variant="bodyStrong" color={aRegler ? 'warning' : etat.couleur}>
          {aRegler ? 'Paiement à régler' : etat.label}
        </Texte>
      </View>
    </Carte>
  );
}

/** Un chiffre du mois, expliqué par une phrase complète. */
function Resume({ icone, phrase, valeur }: { icone: NomIcone; phrase: string; valeur: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.resume}>
      <View style={[styles.pastille, { backgroundColor: c.primarySoft }]}>
        <Icone name={icone} size={22} color="primary" />
      </View>
      <View style={{ flex: 1 }}>
        <Texte variant="body" color="textMuted">
          {phrase}
        </Texte>
        <Texte variant="title" style={styles.chiffres}>
          {valeur}
        </Texte>
      </View>
    </View>
  );
}

export default function ActiviteScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  const [sessions, setSessions] = useState<SessionRecharge[] | null>(null);
  const [kpis, setKpis] = useState<KpisClient | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(async () => {
    const [s, k] = await Promise.all([api.listeSessions(), api.kpisClient()]);
    setSessions(s);
    setKpis(k);
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger().catch(() => setSessions([]));
    }, [charger])
  );

  const sections = useMemo(() => {
    const parMois = new Map<string, SessionRecharge[]>();
    for (const s of sessions ?? []) {
      const mois = capitaliser(formatMois(s.dateDebut));
      parMois.set(mois, [...(parMois.get(mois) ?? []), s]);
    }
    return [...parMois.entries()].map(([title, data]) => ({ title, data }));
  }, [sessions]);

  const mois = kpis?.parMois[kpis.parMois.length - 1];
  const kmMois = mois && kpis ? Math.round((mois.kwh / kpis.kwhAux100Km) * 100) : 0;

  const entete = (
    <View style={styles.entete}>
      <View style={{ gap: 4 }}>
        <Texte variant="title">Mes recharges</Texte>
        <Texte variant="body" color="textMuted">
          Touchez une recharge pour voir tous les détails et la facture.
        </Texte>
      </View>

      <Carte style={styles.bilan}>
        <Texte variant="subheading">Ce mois-ci</Texte>
        {kpis ? (
          <>
            <Resume icone="ev-station" phrase="Vous avez rechargé" valeur={`${mois?.sessions ?? 0} fois`} />
            <Resume icone="cash" phrase="Vous avez payé" valeur={formatPrix(mois?.prix ?? 0)} />
            <Resume icone="road-variant" phrase="Vous pouvez rouler environ" valeur={`${formatNombre(kmMois, 0)} km`} />
          </>
        ) : (
          <View style={{ gap: Espace.md }}>
            {[0, 1, 2].map((i) => (
              <Squelette key={i} hauteur={52} rayon={Rayons.md} />
            ))}
          </View>
        )}
      </Carte>
    </View>
  );

  // Le grand titre défile avec la liste ; une barre compacte prend le relais en haut.
  const defilement = useSharedValue(0);

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.liste, { paddingTop: insets.top + Espace.lg }]}
        sections={sections}
        keyExtractor={(s) => String(s.id)}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={entete}
        renderSectionHeader={({ section }) => (
          <Texte variant="heading" style={styles.titreSection}>
            {section.title}
          </Texte>
        )}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(400)}>
            <LigneSession session={item} kwhAux100Km={kpis?.kwhAux100Km ?? 17} />
          </Animated.View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: Espace.md }} />}
        ListEmptyComponent={
          sessions ? (
            <View style={styles.vide}>
              <Icone name="ev-station" size={40} color="textFaint" />
              <Texte variant="heading" align="center">
                Pas encore de recharge
              </Texte>
              <Texte variant="body" color="textMuted" align="center">
                Après votre première recharge, vous la retrouverez ici avec son prix.
              </Texte>
            </View>
          ) : (
            <View style={{ gap: Espace.md, marginTop: Espace.xl }}>
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
        onScroll={(e) => {
          defilement.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      />
      <BarreTitreCompacte titre="Mes recharges" defilement={defilement} />
    </View>
  );
}

const styles = StyleSheet.create({
  liste: { paddingHorizontal: Espace.xl, paddingBottom: 140 },
  entete: { gap: Espace.lg, marginBottom: Espace.sm },
  bilan: { gap: Espace.lg },
  resume: { flexDirection: 'row', alignItems: 'center', gap: Espace.md },
  pastille: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titreSection: { marginTop: Espace.xl, marginBottom: Espace.md },
  ligne: { gap: Espace.md, padding: 16 },
  ligneHaut: { flexDirection: 'row', alignItems: 'center', gap: Espace.md },
  ligneBas: { flexDirection: 'row', gap: Espace.md, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Espace.md },
  etat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chiffres: { fontVariant: ['tabular-nums'] },
  vide: { alignItems: 'center', gap: Espace.sm, paddingVertical: Espace.xxxl },
});
