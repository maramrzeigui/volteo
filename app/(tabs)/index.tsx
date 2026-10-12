import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionsRapides } from '@/components/accueil/actions-rapides';
import { ConseilDuJour } from '@/components/accueil/conseil-du-jour';
import { TrajetVolta } from '@/components/accueil/trajet-volta';
import { VoitureShowroom } from '@/components/accueil/voiture-showroom';
import { ApercuBorne } from '@/components/apercu-borne';
import { BorneCard } from '@/components/borne-card';
import { SceneRecharge } from '@/components/illustrations/scene-recharge';
import { Avatar } from '@/components/ui/avatar';
import { BarreBatterie } from '@/components/ui/barre-batterie';
import { Bouton } from '@/components/ui/bouton';
import { Carte } from '@/components/ui/carte';
import { ChiffreAnime } from '@/components/ui/chiffre-anime';
import { PointDirect } from '@/components/ui/point-direct';
import { Squelette } from '@/components/ui/squelette';
import { SurfaceEncre } from '@/components/ui/surface-encre';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { formatMinSec, useCompteARebours } from '@/hooks/use-compte-a-rebours';
import { useFavoris } from '@/hooks/use-favoris';
import { useTempsReel } from '@/hooks/use-temps-reel';
import { useSoldeEnDirect } from '@/hooks/use-solde-en-direct';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { confirmer, informer } from '@/lib/dialogue';
import { autonomieKm, finEstimee } from '@/lib/estimation';
import { capitaliser, formatHeure, formatNombre, formatPrix, salutation } from '@/lib/format';
import { notifier } from '@/lib/notifications';
import type { Borne, KpisClient, Reservation, SessionRecharge, Vehicule } from '@/types/domain';

const OBJECTIF_PAR_DEFAUT = 80;

function Stat({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <View style={styles.stat}>
      {children}
      <Texte variant="label" color="textMuted">
        {libelle}
      </Texte>
    </View>
  );
}

function BandeauReservation({
  reservation,
  onAnnuler,
}: {
  reservation: Reservation;
  onAnnuler: () => void;
}) {
  const { c } = useTheme();
  const restant = useCompteARebours(reservation.expireLe);

  return (
    <Carte style={{ ...styles.reservation, borderColor: c.primary }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Texte variant="label" color="primary">
          Prise réservée pour vous
        </Texte>
        <Texte variant="subheading" numberOfLines={1}>
          {reservation.borneNom}
        </Texte>
        <Texte variant="caption" color="textMuted">
          {reservation.typeConnecteur === 'Type2' ? 'Type 2' : reservation.typeConnecteur} ·{' '}
          {reservation.puissanceKw} kW
        </Texte>
      </View>
      <View style={styles.reservationDroite}>
        <Texte variant="number" color={restant < 180 ? 'warning' : 'text'} style={styles.chiffres}>
          {formatMinSec(restant)}
        </Texte>
        <View style={styles.reservationActions}>
          <Pressable onPress={onAnnuler} hitSlop={8}>
            <Texte variant="captionStrong" color="textMuted">
              Annuler
            </Texte>
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() =>
              router.push({ pathname: '/borne/[id]', params: { id: String(reservation.borneId) } })
            }>
            <Texte variant="captionStrong" color="primary">
              Y aller
            </Texte>
          </Pressable>
        </View>
      </View>
    </Carte>
  );
}

export default function AccueilScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { utilisateur } = useAuth();
  const { solde, enCours } = useSoldeEnDirect();
  const { ids: favoris } = useFavoris();

  const [chargement, setChargement] = useState(true);
  const [session, setSession] = useState<SessionRecharge | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [kpis, setKpis] = useState<KpisClient | null>(null);
  const [bornes, setBornes] = useState<Borne[]>([]);
  const [vehicule, setVehicule] = useState<Vehicule | null>(null);
  const [derniere, setDerniere] = useState<SessionRecharge | null>(null);
  const [aRegler, setARegler] = useState(0);
  const [rafraichissement, setRafraichissement] = useState(false);
  const sessionPrecedente = useRef<SessionRecharge | null>(null);
  const [apercu, setApercu] = useState<Borne | null>(null);

  const charger = useCallback(async () => {
    const [s, r, k, b, v, historique] = await Promise.all([
      api.sessionActive(),
      api.reservationActive(),
      api.kpisClient(),
      api.listeBornes(),
      api.listeVehicules(),
      api.listeSessions(),
    ]);

    if (sessionPrecedente.current && !s) {
      notifier(
        'Recharge terminée',
        `Votre session sur ${sessionPrecedente.current.borneNom} est terminée.`
      ).catch(() => undefined);
    }
    sessionPrecedente.current = s;

    setSession(s);
    setReservation(r);
    setKpis(k);
    setBornes(b.filter((x) => x.source === 'reseau' && x.etat === 'disponible'));
    setVehicule(v[0] ?? null);
    setDerniere(historique.find((x) => x.etat === 'terminee' && x.pourcentageBatterie != null) ?? null);
    setARegler(historique.filter((x) => x.paiementStatut === 'en_attente').reduce((t, x) => t + x.prix, 0));
    setChargement(false);
  }, []);


  useFocusEffect(
    useCallback(() => {
      charger().catch(() => setChargement(false));
      const timer = setInterval(() => charger().catch(() => undefined), 20000);
      return () => clearInterval(timer);
    }, [charger])
  );

  // Recharge et disponibilité des bornes poussées en direct par le serveur OCPP.
  useTempsReel(true, () => {
    charger().catch(() => undefined);
  });

  const annulerReservation = async () => {
    if (!reservation) return;
    const ok = await confirmer('Annuler la réservation ?', 'La prise redeviendra libre pour les autres conducteurs.', {
      confirmer: 'Annuler la réservation',
      annuler: 'Garder',
      destructif: true,
    });
    if (!ok) return;
    try {
      await api.annulerReservation(reservation.id);
      await charger();
    } catch (e) {
      informer('Annulation impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    }
  };

  const capacite = vehicule?.capaciteBatterieKwh ?? 60;
  const batterie = session?.pourcentageBatterie ?? derniere?.pourcentageBatterie ?? null;
  const fin =
    session && batterie != null
      ? finEstimee({ batterie, objectif: OBJECTIF_PAR_DEFAUT, capaciteKwh: capacite, puissanceKw: session.puissanceInstantaneeKw })
      : null;
  const moisCourant = kpis?.parMois[kpis.parMois.length - 1];

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.contenu, { paddingTop: insets.top + Espace.lg }]}
      refreshControl={
        <RefreshControl
          refreshing={rafraichissement}
          onRefresh={async () => {
            setRafraichissement(true);
            await charger().catch(() => undefined);
            setRafraichissement(false);
          }}
        />
      }>
      <View style={styles.entete}>
        <View style={{ flex: 1 }}>
          <Texte variant="caption" color="textMuted">
            {salutation()}
          </Texte>
          <Texte variant="title" numberOfLines={1}>
            {capitaliser(utilisateur?.prenom)}
          </Texte>
        </View>
        <Pressable
          accessibilityLabel="Solde du wallet"
          onPress={() => router.push('/profil')}
          style={[styles.solde, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Texte variant="label" color="textMuted">
            Solde
          </Texte>
          <Texte variant="captionStrong" color="copper" style={styles.chiffres}>
            {formatPrix(solde)}
          </Texte>
          {enCours > 0 && (
            <Texte variant="caption" color="primary" style={styles.chiffres}>
              −{formatPrix(enCours)}
            </Texte>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mon compte"
          onPress={() => router.push('/profil')}
          style={styles.avatar}>
          <Avatar utilisateur={utilisateur} />
        </Pressable>
      </View>

      <Animated.View entering={FadeInDown.duration(500)}>
        <SurfaceEncre reflet style={styles.vehicule}>
          {chargement ? (
            <View style={{ gap: 12 }}>
              <Squelette largeur="40%" hauteur={12} />
              <Squelette largeur="70%" hauteur={24} />
              <Squelette hauteur={10} />
            </View>
          ) : session ? (
            <>
              <View style={styles.ligneHaut}>
                <View style={styles.enDirect}>
                  <PointDirect couleur={c.electric} />
                  <Texte variant="label" color="electric">
                    Recharge en cours
                  </Texte>
                </View>
                <Texte variant="caption" color="onInkMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {session.borneNom}
                </Texte>
              </View>
              <View style={styles.scene}>
                <SceneRecharge
                  etat="charge"
                  puissanceKw={session.puissanceInstantaneeKw}
                  batterie={batterie}
                  largeur={Math.min(width - 2 * Espace.xl - 2 * Espace.xl, 340)}
                />
              </View>
              <View style={styles.pourcentage}>
                <ChiffreAnime valeur={batterie ?? 0} variant="display" color="onInk" />
                <Texte variant="heading" color="onInkMuted">
                  %
                </Texte>
              </View>
              <BarreBatterie
                pourcentage={batterie ?? 0}
                cible={OBJECTIF_PAR_DEFAUT}
                couleur={c.electric}
                couleurPiste="#FFFFFF1A"
                couleurTexte={c.onInkMuted}
              />
              <View style={[styles.mesuresDirect, { borderTopColor: '#FFFFFF1A' }]}>
                <View style={styles.mesure}>
                  <Texte variant="number" color="onInk" style={styles.chiffres}>
                    {formatNombre(session.puissanceInstantaneeKw, 0)}
                    <Texte variant="captionStrong" color="onInkMuted"> kW</Texte>
                  </Texte>
                  <Texte variant="label" color="onInkMuted">Puissance</Texte>
                </View>
                <View style={styles.mesure}>
                  <Texte variant="number" color="onInk" style={styles.chiffres}>
                    {formatNombre(session.energieKwh, 1)}
                    <Texte variant="captionStrong" color="onInkMuted"> kWh</Texte>
                  </Texte>
                  <Texte variant="label" color="onInkMuted">Énergie</Texte>
                </View>
                <View style={styles.mesure}>
                  <Texte variant="number" color="onInk" style={styles.chiffres}>
                    {fin ? formatHeure(fin.toISOString()) : '—'}
                  </Texte>
                  <Texte variant="label" color="onInkMuted">Fin à {OBJECTIF_PAR_DEFAUT} %</Texte>
                </View>
              </View>
              <Bouton variante="electrique" titre="Suivre la recharge" onPress={() => router.push('/recharge')} />
            </>
          ) : (
            <>
              <View style={styles.ligneHaut}>
                <Texte variant="label" color="onInkMuted">
                  Mon véhicule
                </Texte>
                {vehicule && (
                  <View style={[styles.plaque, { borderColor: '#FFFFFF33' }]}>
                    <Texte variant="captionStrong" color="onInk" style={styles.chiffres}>
                      {vehicule.immatriculation}
                    </Texte>
                  </View>
                )}
              </View>
              <Texte variant="heading" color="onInk">
                {vehicule ? `${vehicule.marque} ${vehicule.modele}` : 'Ajoutez votre véhicule'}
              </Texte>
              <VoitureShowroom largeur={Math.min(width - 4 * Espace.xl, 360)} batterie={batterie} />
              {batterie != null ? (
                <>
                  <View style={styles.pourcentage}>
                    <ChiffreAnime valeur={batterie} variant="display" color="onInk" />
                    <Texte variant="heading" color="onInkMuted">
                      %
                    </Texte>
                    <Texte variant="body" color="onInkMuted" style={{ marginLeft: 'auto' }}>
                      ≈ {formatNombre(autonomieKm(batterie, capacite), 0)} km
                    </Texte>
                  </View>
                  <BarreBatterie pourcentage={batterie} couleur={c.electric} couleurPiste="#FFFFFF1A" />
                  <Texte variant="caption" color="onInkMuted">
                    Niveau relevé à la fin de votre dernière recharge
                    {derniere ? `, le ${new Date(derniere.dateDebut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''}.
                  </Texte>
                </>
              ) : (
                <Texte variant="body" color="onInkMuted">
                  Le niveau de batterie s’affichera après votre première recharge.
                </Texte>
              )}
              <Bouton variante="electrique" titre="Trouver une borne" onPress={() => router.push('/carte')} />
            </>
          )}
        </SurfaceEncre>
      </Animated.View>

      <ActionsRapides />

      <TrajetVolta />

      {aRegler > 0 && (
        <Animated.View entering={FadeInDown.duration(400)}>
          <Carte onPress={() => router.push('/compte/paiements')} style={{ ...styles.reservation, borderColor: c.warning }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Texte variant="label" color="warning">
                Paiement en attente
              </Texte>
              <Texte variant="subheading">{formatPrix(aRegler)} à régler</Texte>
              <Texte variant="caption" color="textMuted">
                Solde insuffisant à la fin d’une recharge.
              </Texte>
            </View>
            <Texte variant="captionStrong" color="primary">
              Régler
            </Texte>
          </Carte>
        </Animated.View>
      )}

      {reservation && !session && (
        <Animated.View entering={FadeInDown.duration(400)}>
          <BandeauReservation reservation={reservation} onAnnuler={annulerReservation} />
        </Animated.View>
      )}

      {!session && bornes.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionEntete}>
            <Texte variant="heading">Disponibles maintenant</Texte>
            <Pressable onPress={() => router.push('/bornes')} hitSlop={8}>
              <Texte variant="captionStrong" color="primary">
                Tout voir
              </Texte>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.carrouselConteneur}
            contentContainerStyle={styles.carrousel}>
            {bornes.map((b, i) => (
              <Animated.View key={b.id} entering={FadeInDown.delay(120 + i * 80).duration(450)} style={styles.carteCarrousel}>
                <BorneCard borne={b} favori={favoris.has(b.id)} compacte onPress={() => setApercu(b)} />
              </Animated.View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionEntete}>
          <Texte variant="heading">Ce mois-ci</Texte>
          <Pressable onPress={() => router.push('/sessions')} hitSlop={8}>
            <Texte variant="captionStrong" color="primary">
              Mon activité
            </Texte>
          </Pressable>
        </View>
        <Carte style={styles.stats}>
          <Stat libelle="Énergie">
            <ChiffreAnime valeur={moisCourant?.kwh} decimales={0} unite="kWh" />
          </Stat>
          <View style={[styles.separateur, { backgroundColor: c.border }]} />
          <Stat libelle="Dépensé">
            <ChiffreAnime valeur={moisCourant?.prix} decimales={2} color="copper" unite="DT" />
          </Stat>
          <View style={[styles.separateur, { backgroundColor: c.border }]} />
          <Stat libelle="Autonomie">
            <ChiffreAnime
              valeur={moisCourant && kpis ? (moisCourant.kwh / kpis.kwhAux100Km) * 100 : undefined}
              unite="km"
            />
          </Stat>
        </Carte>
      </View>

      <ConseilDuJour />
      <ApercuBorne borne={apercu} onFermer={() => setApercu(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenu: { paddingHorizontal: Espace.xl, paddingBottom: Espace.xxxl + 90, gap: Espace.xl },
  entete: { flexDirection: 'row', alignItems: 'center', gap: Espace.md },
  solde: {
    borderWidth: 1,
    borderRadius: Rayons.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'flex-end',
  },
  avatar: { borderRadius: 22 },
  vehicule: { borderRadius: Rayons.xl, padding: Espace.xl, gap: Espace.md },
  scene: { alignItems: 'center', marginVertical: -4 },
  ligneHaut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  enDirect: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plaque: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  pourcentage: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  mesuresDirect: { flexDirection: 'row', borderTopWidth: 1, paddingTop: Espace.md, marginBottom: 4 },
  mesure: { flex: 1, gap: 2 },
  reservation: { flexDirection: 'row', alignItems: 'center', gap: Espace.md, borderWidth: 1.5 },
  reservationDroite: { alignItems: 'flex-end', gap: 6 },
  reservationActions: { flexDirection: 'row', gap: 14 },
  section: { gap: Espace.md },
  sectionEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  carrouselConteneur: { marginHorizontal: -Espace.xl },
  // alignItems: 'flex-start' : chaque carte garde sa hauteur naturelle (identique pour toutes).
  carrousel: { paddingHorizontal: Espace.xl, gap: Espace.md, paddingBottom: 6, alignItems: 'flex-start' },
  carteCarrousel: { width: 270 },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  separateur: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  chiffres: { fontVariant: ['tabular-nums'] },
});
