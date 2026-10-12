import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DepartVoiture } from '@/components/illustrations/depart-voiture';
import { SceneRecharge, type EtatScene } from '@/components/illustrations/scene-recharge';
import { Bouton } from '@/components/ui/bouton';
import { ChiffreAnime } from '@/components/ui/chiffre-anime';
import { CourbePuissance } from '@/components/ui/courbe-puissance';
import { PointDirect } from '@/components/ui/point-direct';
import { Texte } from '@/components/ui/texte';
import { Celebration } from '@/components/ui/celebration';
import { useTempsReel } from '@/hooks/use-temps-reel';
import { Colors, Espace, Rayons } from '@/constants/theme';
import * as api from '@/lib/api';
import { confirmer, informer } from '@/lib/dialogue';
import { finEstimee } from '@/lib/estimation';
import { formatDuree, formatHeure, minutesDepuis } from '@/lib/format';
import type { Mesure, SessionRecharge, Vehicule } from '@/types/domain';

const OBJECTIFS = [80, 90, 100];
// Écran immersif : toujours sur fond nuit, quel que soit le thème.
const c = Colors.dark;

export default function RechargeScreen() {
  const insets = useSafeAreaInsets();
  const { width: largeurEcran } = useWindowDimensions();
  const [session, setSession] = useState<SessionRecharge | null>(null);
  const [mesures, setMesures] = useState<Mesure[]>([]);
  const [vehicule, setVehicule] = useState<Vehicule | null>(null);
  const [objectif, setObjectif] = useState(80);
  const [terminee, setTerminee] = useState<SessionRecharge | null>(null);
  const [arret, setArret] = useState(false);

  const sessionCourante = useRef<SessionRecharge | null>(null);

  const charger = useCallback(async () => {
    const s = await api.sessionActive();
    const avant = sessionCourante.current;
    sessionCourante.current = s;
    setSession(s);
    if (s) {
      setMesures(await api.mesuresSession(s.id));
    } else if (avant) {
      // Fin côté borne ou back-office : montant final et statut du paiement depuis l'historique.
      const finale = (await api.listeSessions().catch(() => [])).find((x) => x.id === avant.id);
      setTerminee(finale ?? avant);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger().catch(() => undefined);
      api
        .listeVehicules()
        .then((v) => setVehicule(v[0] ?? null))
        .catch(() => undefined);
      // Secours si le temps réel est coupé (proxy, réseau mobile).
      const timer = setInterval(() => charger().catch(() => undefined), 15000);
      return () => clearInterval(timer);
    }, [charger])
  );

  // Chaque mesure envoyée par la borne rafraîchit l'écran immédiatement.
  useTempsReel(true, (evenement) => {
    if (evenement === 'session.maj') charger().catch(() => undefined);
  });

  const arreter = async () => {
    if (!session) return;
    const ok = await confirmer(
      'Arrêter la recharge ?',
      `La session sur ${session.borneNom} sera terminée et facturée sur votre wallet.`,
      { confirmer: 'Arrêter', annuler: 'Continuer', destructif: true }
    );
    if (!ok) return;
    setArret(true);
    try {
      const finale = await api.arreterSession(session.id);
      sessionCourante.current = null;
      setTerminee(finale);
      setSession(null);
    } catch (e) {
      informer('Arrêt impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    } finally {
      setArret(false);
    }
  };

  const batterie = session?.pourcentageBatterie ?? null;
  // Tant que la borne n'a envoyé aucune mesure, la charge est en cours d'établissement.
  const etatScene: EtatScene =
    session?.etat === 'en_pause' ? 'pause' : !session?.puissanceInstantaneeKw && !session?.energieKwh ? 'connexion' : 'charge';

  // Retour haptique quand l'énergie commence à circuler, puis en fin de recharge.
  const etatPrecedent = useRef<EtatScene | null>(null);
  useEffect(() => {
    if (etatPrecedent.current === 'connexion' && etatScene === 'charge') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    etatPrecedent.current = session ? etatScene : null;
  }, [etatScene, session]);

  const fin =
    session && batterie != null
      ? finEstimee({
          batterie,
          objectif,
          capaciteKwh: vehicule?.capaciteBatterieKwh ?? 60,
          puissanceKw: session.puissanceInstantaneeKw,
        })
      : null;

  return (
    <View style={[styles.ecran, { backgroundColor: c.ink }]}>
      <ScrollView contentContainerStyle={[styles.contenu, { paddingTop: insets.top + Espace.sm, paddingBottom: insets.bottom + Espace.xl }]}>
        <View style={styles.barre}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
            <Texte variant="bodyStrong" color={c.onInkMuted}>
              Fermer
            </Texte>
          </Pressable>
          {session && (
            <View style={styles.enDirect}>
              <PointDirect couleur={session.etat === 'en_pause' ? c.warning : c.electric} />
              <Texte variant="label" color={session.etat === 'en_pause' ? c.warning : c.electric}>
                {session.etat === 'en_pause' ? 'En pause' : 'En direct'}
              </Texte>
            </View>
          )}
        </View>

        {session ? (
          <>
            <Animated.View entering={FadeIn.duration(500)} style={styles.titre}>
              <Texte variant="caption" color={c.onInkMuted}>
                {session.typeConnecteur === 'Type2' ? 'Type 2' : session.typeConnecteur} · depuis{' '}
                {formatDuree(minutesDepuis(session.dateDebut))}
              </Texte>
              <Texte variant="heading" color={c.onInk} align="center">
                {session.borneNom}
              </Texte>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(150).duration(700)} style={styles.centre}>
              <View style={styles.pourcent}>
                <ChiffreAnime
                  valeur={batterie ?? session.energieKwh}
                  decimales={batterie != null ? 0 : 1}
                  variant="display"
                  color={c.onInk}
                />
                <Texte variant="heading" color={c.onInkMuted}>
                  {batterie != null ? '%' : 'kWh'}
                </Texte>
              </View>
              <Texte variant="caption" color={etatScene === 'pause' ? c.warning : c.onInkMuted}>
                {etatScene === 'connexion'
                  ? 'Connexion à la voiture…'
                  : etatScene === 'pause'
                    ? 'Recharge suspendue par l’exploitant'
                    : fin
                      ? `${objectif} % vers ${formatHeure(fin.toISOString())}`
                      : 'Énergie transmise'}
              </Texte>
            </Animated.View>

            <Animated.View entering={FadeIn.delay(250).duration(800)} style={styles.scene}>
              <SceneRecharge
                etat={etatScene}
                puissanceKw={session.puissanceInstantaneeKw}
                puissanceMaxKw={session.puissanceMaxKw}
                batterie={batterie}
                largeur={Math.min(largeurEcran - Espace.xl * 2, 420)}
              />
            </Animated.View>

            <View style={styles.objectifs}>
              <Texte variant="label" color={c.onInkMuted}>
                Objectif
              </Texte>
              <View style={styles.choix}>
                {OBJECTIFS.map((o) => (
                  <Pressable
                    key={o}
                    accessibilityRole="button"
                    accessibilityState={{ selected: o === objectif }}
                    onPress={() => setObjectif(o)}
                    style={[
                      styles.choixBouton,
                      {
                        backgroundColor: o === objectif ? c.action : '#FFFFFF0F',
                        borderColor: o === objectif ? c.action : '#FFFFFF1F',
                      },
                    ]}>
                    <Texte variant="captionStrong" color={o === objectif ? c.onPrimary : c.onInk}>
                      {o} %
                    </Texte>
                  </Pressable>
                ))}
              </View>
            </View>

            <Animated.View entering={FadeInDown.delay(250).duration(500)} style={[styles.grille, { borderColor: '#FFFFFF14' }]}>
              {[
                { libelle: 'Puissance', valeur: session.puissanceInstantaneeKw, dec: 0, unite: 'kW' },
                { libelle: 'Énergie', valeur: session.energieKwh, dec: 1, unite: 'kWh' },
                { libelle: 'Coût', valeur: session.prix, dec: 2, unite: 'DT' },
              ].map((m) => (
                <View key={m.libelle} style={styles.cellule}>
                  <View style={styles.pourcent}>
                    <ChiffreAnime valeur={m.valeur} decimales={m.dec} color={m.libelle === 'Coût' ? c.copper : c.onInk} />
                    <Texte variant="captionStrong" color={c.onInkMuted}>
                      {m.unite}
                    </Texte>
                  </View>
                  <Texte variant="label" color={c.onInkMuted}>
                    {m.libelle}
                  </Texte>
                </View>
              ))}
            </Animated.View>

            {session.budget != null && session.budget > 0 && (
              <View style={[styles.budget, { borderColor: '#FFFFFF14' }]}>
                <View style={styles.budgetLigne}>
                  <Texte variant="caption" color={c.onInkMuted}>Solde restant</Texte>
                  <Texte variant="captionStrong" color={c.copper}>
                    {Math.max(0, session.budget - session.prix).toFixed(2).replace('.', ',')} DT
                  </Texte>
                </View>
                <View style={styles.budgetLigne}>
                  <Texte variant="caption" color={c.onInkMuted}>Déjà consommé</Texte>
                  <Texte variant="caption" color={c.onInkMuted}>
                    {session.prix.toFixed(2).replace('.', ',')} DT sur {session.budget.toFixed(2).replace('.', ',')} DT
                  </Texte>
                </View>
                <View style={styles.budgetPiste}>
                  <View style={[styles.budgetNiveau, { width: `${Math.min(100, (session.prix / session.budget) * 100)}%`, backgroundColor: c.primary }]} />
                </View>
                <Texte variant="caption" color={c.onInkMuted}>
                  La recharge s’arrête automatiquement quand votre solde est atteint : vous ne payez jamais plus que ce que vous avez.
                </Texte>
              </View>
            )}

            <Animated.View entering={FadeInDown.delay(350).duration(500)} style={[styles.courbe, { backgroundColor: '#FFFFFF08', borderColor: '#FFFFFF14' }]}>
              <View style={styles.courbeEntete}>
                <Texte variant="subheading" color={c.onInk}>
                  Puissance délivrée
                </Texte>
                <Texte variant="caption" color={c.onInkMuted}>
                  mesures de la borne
                </Texte>
              </View>
              <CourbePuissance
                mesures={mesures}
                couleur={c.electric}
                couleurGrille="#FFFFFF14"
                couleurTexte={c.onInkMuted}
                enDirect
              />
            </Animated.View>

            <Bouton titre="Arrêter la recharge" variante="surEncre" chargement={arret} onPress={arreter} />
          </>
        ) : terminee ? (
          <Animated.View entering={FadeInDown.duration(500)} style={styles.resume}>
            <Celebration />
            <Texte variant="label" color={c.electric}>
              Recharge terminée
            </Texte>
            <Texte variant="title" color={c.onInk} align="center">
              {terminee.borneNom}
            </Texte>
            <DepartVoiture largeur={Math.min(largeurEcran - Espace.xl * 2, 420)} />
            <View style={[styles.grille, { borderColor: '#FFFFFF14', alignSelf: 'stretch' }]}>
              <View style={styles.cellule}>
                <ChiffreAnime valeur={terminee.energieKwh} decimales={1} color={c.onInk} suffixe=" kWh" />
                <Texte variant="label" color={c.onInkMuted}>Énergie</Texte>
              </View>
              <View style={styles.cellule}>
                <ChiffreAnime valeur={terminee.prix} decimales={2} color={c.copper} suffixe=" DT" />
                <Texte variant="label" color={c.onInkMuted}>Facturé</Texte>
              </View>
            </View>
            {terminee.paiementStatut === 'en_attente' ? (
              <>
                <Texte variant="caption" color={c.warning} align="center">
                  Solde du wallet insuffisant : le paiement est en attente. Réglez-le avec votre wallet ou par carte.
                </Texte>
                <Bouton variante="electrique"
                  titre="Régler maintenant"
                  onPress={() => router.replace('/compte/paiements')}
                  style={{ alignSelf: 'stretch' }}
                />
                <Bouton titre="Plus tard" variante="surEncre" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
              </>
            ) : (
              <>
                <Texte variant="caption" color={c.onInkMuted} align="center">
                  {terminee.arretSolde
                    ? 'Recharge arrêtée automatiquement : votre solde est atteint. Rechargez votre wallet pour continuer.'
                    : terminee.prix > 0
                    ? 'Le montant a été débité de votre wallet. La facture est disponible dans votre compte.'
                    : 'Aucun montant à payer pour cette recharge (kWh offerts par votre abonnement ou énergie nulle).'}
                </Texte>
                <Bouton variante="electrique" titre="Terminer" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
              </>
            )}
          </Animated.View>
        ) : (
          <View style={styles.resume}>
            <Texte variant="heading" color={c.onInk}>
              Aucune recharge en cours
            </Texte>
            <Bouton variante="electrique" titre="Trouver une borne" onPress={() => router.replace('/carte')} style={{ alignSelf: 'stretch' }} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1 },
  contenu: { paddingHorizontal: Espace.xl, gap: Espace.xl },
  barre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 44 },
  enDirect: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titre: { alignItems: 'center', gap: 4 },
  scene: { alignItems: 'center', marginTop: -Espace.md },
  centre: { alignItems: 'center', gap: 2 },
  pourcent: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  objectifs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  choix: { flexDirection: 'row', gap: 8 },
  choixBouton: { borderWidth: 1, borderRadius: Rayons.pill, paddingHorizontal: 16, height: 36, justifyContent: 'center' },
  grille: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: Espace.lg },
  cellule: { flex: 1, alignItems: 'center', gap: 4 },
  courbe: { borderWidth: 1, borderRadius: Rayons.lg, padding: Espace.lg, gap: Espace.md },
  courbeEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  budget: { borderWidth: 1, borderRadius: Rayons.lg, padding: Espace.lg, gap: 8, backgroundColor: '#FFFFFF08' },
  budgetLigne: { flexDirection: 'row', justifyContent: 'space-between' },
  budgetPiste: { height: 8, borderRadius: 4, backgroundColor: '#FFFFFF14', overflow: 'hidden' },
  budgetNiveau: { height: '100%', borderRadius: 4 },
  resume: { alignItems: 'center', gap: Espace.lg, paddingTop: Espace.xxxl },
});
