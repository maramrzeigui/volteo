import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NOM_PRISE } from '@/components/borne-card';
import { BorneIndisponible, borneIndisponible } from '@/components/borne-indisponible';
import { EtatBadge } from '@/components/etat-badge';
import { PhotoBorneIllustree } from '@/components/illustrations/photo-borne';
import { Bouton } from '@/components/ui/bouton';
import { Carte } from '@/components/ui/carte';
import { ChiffreAnime } from '@/components/ui/chiffre-anime';
import { Curseur } from '@/components/ui/curseur';
import { SurfaceEncre } from '@/components/ui/surface-encre';
import { Icone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { formatMinSec, useCompteARebours } from '@/hooks/use-compte-a-rebours';
import { useFavoris } from '@/hooks/use-favoris';
import { useTempsReel } from '@/hooks/use-temps-reel';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { confirmer, informer } from '@/lib/dialogue';
import { payerEnLigne } from '@/lib/paiement-en-ligne';
import { estimerCharge } from '@/lib/estimation';
import { formatDuree, formatNombre, ilYa } from '@/lib/format';
import { libelleTarif, prixRecharge, tarifDeBorne, UNITE_TARIF } from '@/lib/tarifs';
import type { Borne, Connecteur, Reservation, Souscription, Vehicule } from '@/types/domain';

const LIBELLE_PRISE: Record<string, string> = {
  disponible: 'Libre',
  occupe: 'Occupée',
  reserve: 'Réservée',
  indisponible: 'Indisponible',
  defaut: 'En défaut',
  inconnu: 'État inconnu',
};

function OptionPrise({
  prise,
  choisie,
  selectionnable,
  borneIndisponible,
  onPress,
}: {
  prise: Connecteur;
  choisie: boolean;
  selectionnable: boolean;
  /** La borne entière refuse les recharges : la prise n'est pas « libre » pour le client. */
  borneIndisponible: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const couleurEtat = borneIndisponible
    ? 'textFaint'
    : prise.etat === 'disponible' ? 'success' : prise.etat === 'reserve' ? 'warning' : 'textFaint';

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: choisie, disabled: !selectionnable }}
      disabled={!selectionnable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.prise,
        {
          backgroundColor: choisie ? c.primarySoft : c.surface,
          borderColor: choisie ? c.primary : c.border,
          opacity: selectionnable ? (pressed ? 0.85 : 1) : 0.55,
        },
      ]}>
      <Texte variant="heading">{NOM_PRISE[prise.type] ?? prise.type}</Texte>
      <Texte variant="number" style={styles.kwPrise}>
        {prise.puissanceKw}
        <Texte variant="captionStrong" color="textMuted"> kW</Texte>
      </Texte>
      <Texte variant="captionStrong" color={couleurEtat}>
        {borneIndisponible ? 'Indisponible' : choisie ? 'Sélectionnée' : (LIBELLE_PRISE[prise.etat] ?? prise.etat)}
      </Texte>
    </Pressable>
  );
}

function LigneInfo({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={styles.ligneInfo}>
      <Texte variant="body" color="textMuted">
        {libelle}
      </Texte>
      <Texte variant="bodyStrong" style={styles.chiffres}>
        {valeur}
      </Texte>
    </View>
  );
}

function Estimation({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <View style={styles.estimation}>
      {children}
      <Texte variant="label" color="textMuted">
        {libelle}
      </Texte>
    </View>
  );
}

/** Photo (ou illustration) en fond de l'en-tête, fondue dans le noir de la fiche. */
function PhotoHero({ borne, hauteur }: { borne: Borne; hauteur: number }) {
  const [erreur, setErreur] = useState(false);
  const photo = !erreur ? api.urlMedia(borne.photoUrl) : null;
  return (
    <View pointerEvents="none" style={[styles.photoHero, { height: hauteur }]}>
      {photo ? (
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} onError={() => setErreur(true)} />
      ) : (
        <PhotoBorneIllustree id={borne.id} rapide={(borne.puissanceKw ?? 0) >= 50} />
      )}
      <LinearGradient colors={['#0D0D1026', '#0D0D1066', '#0D0D10D9', '#0D0D10']} locations={[0, 0.3, 0.62, 1]} style={StyleSheet.absoluteFill} />
      {photo && borne.photoCredit && (
        <Texte variant="caption" color="#FFFFFF80" style={styles.creditPhoto} numberOfLines={1}>
          Photo © {borne.photoCredit}
        </Texte>
      )}
    </View>
  );
}

export default function BorneDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { ids: favoris, basculer } = useFavoris();

  // En-tête en parallaxe : il glisse moins vite que le contenu, et s'étire quand on tire vers le bas.
  const defilement = useSharedValue(0);
  const surDefilement = useAnimatedScrollHandler((e) => {
    defilement.value = e.contentOffset.y;
  });
  const heroAnime = useAnimatedStyle(() => {
    const y = defilement.value;
    if (y < 0) return { transform: [{ translateY: y / 2 }, { scale: 1 + -y / 500 }] };
    return {
      transform: [{ translateY: y * 0.4 }],
      opacity: interpolate(y, [0, 260], [1, 0.35], 'clamp'),
    };
  });

  const [borne, setBorne] = useState<Borne | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [vehicule, setVehicule] = useState<Vehicule | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [souscription, setSouscription] = useState<Souscription | null>(null);
  const [priseChoisie, setPriseChoisie] = useState<Connecteur | null>(null);
  const [batterie, setBatterie] = useState(20);
  const [objectif, setObjectif] = useState(80);
  const [action, setAction] = useState<'demarrage' | 'reservation' | null>(null);

  const charger = useCallback(async () => {
    // `id` peut être une référence OCPP : lien borneapp://borne/BRN-TUN-001 du QR code collé sur la borne.
    const [b, v, r, s] = await Promise.all([
      api.detailBorne(id),
      api.listeVehicules(),
      api.reservationActive(),
      api.souscriptionActive().catch(() => null),
    ]);
    setBorne(b);
    setVehicule(v[0] ?? null);
    setReservation(r);
    setSouscription(s);

    const reservee = r && r.borneId === b.id ? b.connecteurs.find((x) => x.id === r.connecteurId) : undefined;
    const libres = b.connecteurs.filter((x) => x.etat === 'disponible');
    // Par défaut : la prise libre la plus puissante, pour que « Démarrer » soit utilisable tout de suite.
    const plusPuissante = [...libres].sort((x, y) => y.puissanceKw - x.puissanceKw)[0] ?? null;
    setPriseChoisie((avant) => {
      const precedente = avant ? b.connecteurs.find((x) => x.id === avant.id) : undefined;
      const encoreValable = precedente && (precedente.etat === 'disponible' || precedente.id === reservee?.id);
      return reservee ?? (encoreValable ? precedente : plusPuissante);
    });
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      charger().catch((e) => setErreur(e instanceof Error ? e.message : 'Borne introuvable'));
    }, [charger])
  );

  // État de la borne poussé en direct (OCPP) : hors ligne, de retour, prise occupée…
  useTempsReel(true, (evenement, donnees) => {
    if (evenement === 'borne.maj' && borne && donnees.id === borne.id) charger().catch(() => undefined);
  });

  const restant = useCompteARebours(reservation?.borneId === borne?.id ? reservation?.expireLe : null);

  if (!borne) {
    return (
      <View style={[styles.chargement, { backgroundColor: c.background }]}>
        {erreur ? (
          <>
            <Texte variant="subheading">{erreur}</Texte>
            <Bouton titre="Retour" variante="secondaire" onPress={() => router.back()} />
          </>
        ) : (
          <ActivityIndicator size="large" color={c.primary} />
        )}
      </View>
    );
  }

  const publique = borne.source === 'publique';
  const favori = favoris.has(borne.id);
  // État calculé côté serveur (OCPP) : hors ligne, non disponible, maintenance… → aucune recharge.
  const horsService = borneIndisponible(borne);
  const libres = horsService ? 0 : borne.connecteurs.filter((x) => x.etat === 'disponible').length;
  const maReservation = reservation && reservation.borneId === borne.id ? reservation : null;
  const selectionnable = (p: Connecteur) =>
    !horsService && (p.etat === 'disponible' || maReservation?.connecteurId === p.id);

  const tarif = tarifDeBorne(borne);
  const affichageTarif = libelleTarif(tarif);
  const remise = souscription?.remisePourcent ?? 0;
  const charge = priseChoisie
    ? estimerCharge({
        batterieActuelle: batterie,
        objectif,
        capaciteKwh: vehicule?.capaciteBatterieKwh ?? 60,
        puissanceKw: priseChoisie.puissanceKw,
        tarifKwh: 0,
      })
    : null;
  // Prix selon le tarif réel de la borne (kWh, minute, heure ou puissance) et la remise d'abonnement.
  const estimation =
    charge && priseChoisie
      ? {
          ...charge,
          prix: prixRecharge({
            tarif,
            energieKwh: charge.energieKwh,
            minutes: charge.minutes,
            puissanceKw: priseChoisie.puissanceKw,
            remisePourcent: remise,
          }),
        }
      : null;

  const ouvrirItineraire = () => {
    const url = Platform.select({
      ios: `maps:0,0?q=${encodeURIComponent(borne.nom)}@${borne.latitude},${borne.longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${borne.latitude},${borne.longitude}`,
    });
    Linking.openURL(url).catch(() => undefined);
  };

  const demarrer = async () => {
    if (!priseChoisie) return;
    setAction('demarrage');
    try {
      await api.demarrerSession(borne.id, priseChoisie.id, vehicule?.id);
      router.replace('/recharge');
    } catch (e) {
      const texte = e instanceof Error ? e.message : 'Réessayez dans un instant.';
      // Paiement garanti : solde minimum ou recharge impayée → on propose de régler tout de suite.
      if (/impayée/i.test(texte)) {
        if (await confirmer('Recharge impayée', texte, { confirmer: 'Régler maintenant', annuler: 'Plus tard' })) router.push('/compte/paiements');
      } else if (/solde insuffisant/i.test(texte)) {
        if (await confirmer('Solde insuffisant', texte, { confirmer: 'Recharger 20 DT', annuler: 'Plus tard' })) {
          await payerEnLigne({ objet: 'recharge_wallet', montant: 20 });
        }
      } else {
        informer('Démarrage impossible', texte);
      }
    } finally {
      setAction(null);
    }
  };

  const reserver = async () => {
    if (!priseChoisie) return;
    if (maReservation) {
      const ok = await confirmer('Annuler la réservation ?', 'La prise redeviendra libre pour les autres conducteurs.', {
        confirmer: 'Annuler la réservation',
        annuler: 'Garder',
        destructif: true,
      });
      if (!ok) return;
    }
    setAction('reservation');
    try {
      if (maReservation) await api.annulerReservation(maReservation.id);
      else await api.reserver(priseChoisie.id);
      await charger();
    } catch (e) {
      informer('Réservation impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    } finally {
      setAction(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: 150 }}
        onScroll={surDefilement}
        scrollEventThrottle={16}>
        <Animated.View style={heroAnime}>
          <SurfaceEncre style={{ ...styles.hero, paddingTop: insets.top + Espace.sm }}>
            <PhotoHero borne={borne} hauteur={insets.top + 300} />
            <View style={styles.barre}>
              <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10}>
                <Texte variant="bodyStrong" color="onInkMuted">
                  Retour
                </Texte>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: favori }}
                onPress={() => basculer(borne.id)}
                style={[
                  styles.favori,
                  {
                    backgroundColor: favori ? c.action : '#FFFFFF14',
                    borderColor: favori ? c.action : '#FFFFFF26',
                  },
                ]}>
                <Texte variant="captionStrong" color={favori ? 'onPrimary' : 'onInk'}>
                  {favori ? 'Dans mes favoris' : 'Ajouter aux favoris'}
                </Texte>
              </Pressable>
            </View>

            <Animated.View entering={FadeInDown.duration(450)} style={styles.titres}>
              <Texte variant="label" color={publique ? 'onInkMuted' : 'primary'}>
                {publique ? (borne.operateur ?? 'Autre opérateur') : `Réseau Volteo · ${borne.reference}`}
              </Texte>
              <Texte variant="title" color="onInk">
                {borne.nom}
              </Texte>
              <Texte variant="body" color="onInkMuted">
                {borne.adresse}
              </Texte>
              <View style={{ marginTop: 6 }}>
                <EtatBadge etat={borne.etat} surEncre />
              </View>
            </Animated.View>

            {(!publique || borne.puissanceKw != null) && (
              <View style={[styles.chiffresHero, { borderTopColor: '#FFFFFF1A' }]}>
                <View style={styles.chiffreHero}>
                  <Texte variant="label" color="onInkMuted">Puissance</Texte>
                  <Texte variant="number" color="onInk">
                    {borne.puissanceKw ?? '—'}
                    <Texte variant="captionStrong" color="onInkMuted"> kW</Texte>
                  </Texte>
                </View>
                {!publique && (
                  <>
                    <View style={styles.chiffreHero}>
                      <Texte variant="label" color={tarif.special ? 'primary' : 'onInkMuted'}>
                        {tarif.special ? 'Tarif promo' : affichageTarif.heuresCreuses ? 'Heures creuses' : 'Tarif'}
                      </Texte>
                      <Texte variant="number" color="onInk">
                        {affichageTarif.montant}
                        <Texte variant="captionStrong" color="onInkMuted"> DT/{UNITE_TARIF[tarif.mode]}</Texte>
                      </Texte>
                    </View>
                    <View style={styles.chiffreHero}>
                      <Texte variant="label" color="onInkMuted">Prises libres</Texte>
                      <Texte variant="number" color="onInk">
                        {libres}
                        <Texte variant="captionStrong" color="onInkMuted"> / {borne.connecteurs.length}</Texte>
                      </Texte>
                    </View>
                  </>
                )}
              </View>
            )}
          </SurfaceEncre>
        </Animated.View>

        <View style={styles.corps}>
          {horsService && <BorneIndisponible borne={borne} />}
          {!publique && (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/assistant',
                  params: { question: `Parle-moi de la borne ${borne.nom} (${borne.reference}) : disponibilité, tarif et prix d’une recharge de 20 à 80 %.` },
                })
              }
              style={({ pressed }) => [styles.volta, { backgroundColor: c.primarySoft, borderColor: '#E5545F4D', opacity: pressed ? 0.85 : 1 }]}>
              <Icone name="robot-happy-outline" size={20} color="primary" />
              <Texte variant="bodyStrong" style={{ flex: 1 }}>
                Demander à Volta
              </Texte>
              <Texte variant="caption" color="textMuted">
                prix, conseils
              </Texte>
              <Icone name="chevron-right" size={18} color="textFaint" />
            </Pressable>
          )}
          {publique ? (
            <Carte style={{ gap: 6 }}>
              <Texte variant="subheading">Borne d’un autre opérateur</Texte>
              <Texte variant="body" color="textMuted">
                Elle n’est pas reliée au réseau Volteo : la recharge se lance sur place ou depuis
                l’application de {borne.operateur ?? 'l’opérateur'}. Données OpenStreetMap.
              </Texte>
            </Carte>
          ) : (
            <>
              {maReservation && (
                <Animated.View entering={FadeInDown.duration(400)}>
                  <Carte style={{ ...styles.bandeau, borderColor: c.primary }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Texte variant="label" color="primary">
                        Réservée pour vous
                      </Texte>
                      <Texte variant="body" color="textMuted">
                        La prise vous attend. Branchez-vous puis lancez la recharge.
                      </Texte>
                    </View>
                    <Texte variant="number" color={restant < 180 ? 'warning' : 'text'} style={styles.chiffres}>
                      {formatMinSec(restant)}
                    </Texte>
                  </Carte>
                </Animated.View>
              )}

              <Texte variant="heading">Choisissez une prise</Texte>
              <View style={styles.prises}>
                {borne.connecteurs.map((prise, i) => (
                  <Animated.View key={prise.id} entering={FadeInDown.delay(i * 70).duration(400)} style={styles.priseConteneur}>
                    <OptionPrise
                      prise={prise}
                      choisie={!horsService && priseChoisie?.id === prise.id}
                      selectionnable={selectionnable(prise)}
                      borneIndisponible={horsService}
                      onPress={() => setPriseChoisie(priseChoisie?.id === prise.id ? null : prise)}
                    />
                  </Animated.View>
                ))}
              </View>

              <Carte style={styles.planificateur}>
                <View style={{ gap: 2 }}>
                  <Texte variant="heading">Planifier la charge</Texte>
                  <Texte variant="caption" color="textMuted">
                    {vehicule
                      ? `${vehicule.marque} ${vehicule.modele} · batterie ${vehicule.capaciteBatterieKwh} kWh`
                      : 'Batterie de 60 kWh par défaut'}
                  </Texte>
                </View>
                <Curseur
                  libelle="Batterie actuelle"
                  valeur={batterie}
                  max={95}
                  onChange={(v) => {
                    setBatterie(v);
                    if (v >= objectif) setObjectif(Math.min(100, v + 5));
                  }}
                />
                <Curseur
                  libelle="Objectif"
                  valeur={objectif}
                  min={10}
                  onChange={(v) => setObjectif(Math.max(v, batterie + 5))}
                />
                {estimation ? (
                  <View style={[styles.estimations, { borderTopColor: c.border }]}>
                    <Estimation libelle="Durée">
                      <Texte variant="number" style={styles.chiffres}>
                        {formatDuree(estimation.minutes)}
                      </Texte>
                    </Estimation>
                    <Estimation libelle="Énergie">
                      <ChiffreAnime valeur={estimation.energieKwh} decimales={1} suffixe=" kWh" duree={400} />
                    </Estimation>
                    <Estimation libelle="Prix estimé">
                      <ChiffreAnime valeur={estimation.prix} decimales={2} suffixe=" DT" color="copper" duree={400} />
                    </Estimation>
                  </View>
                ) : (
                  <Texte variant="caption" color="textMuted">
                    Choisissez une prise pour obtenir une estimation.
                  </Texte>
                )}
                {estimation && (
                  <Texte variant="caption" color="textMuted">
                    ≈ {formatNombre(estimation.kmAjoutes, 0)} km d’autonomie ajoutés
                    {remise > 0 ? `, remise ${souscription?.abonnementNom} de ${remise} % incluse` : ''}
                    {souscription && souscription.kwhInclus > 0 ? ' (hors kWh offerts du mois)' : ''}. Estimation : la
                    puissance réelle dépend du véhicule et de la température.
                  </Texte>
                )}
              </Carte>
            </>
          )}

          <Texte variant="heading">Informations</Texte>
          <Carte style={styles.infos}>
            {!publique && (
              <LigneInfo
                libelle="Tarif"
                valeur={`${tarif.nom}${tarif.valideAu ? ` · jusqu’au ${new Date(tarif.valideAu).toLocaleDateString('fr-FR')}` : ''}`}
              />
            )}
            {!publique && tarif.prixHeuresCreuses != null && tarif.heuresCreusesDebut && (
              <LigneInfo
                libelle="Heures creuses"
                valeur={`${formatNombre(tarif.prixHeuresCreuses, 2)} DT · ${tarif.heuresCreusesDebut}–${tarif.heuresCreusesFin}`}
              />
            )}
            {!publique && tarif.fraisSession > 0 && (
              <LigneInfo libelle="Frais par recharge" valeur={`${formatNombre(tarif.fraisSession, 2)} DT`} />
            )}
            {!publique && <LigneInfo libelle="Dernier signal" valeur={ilYa(borne.dernierHeartbeat)} />}
            {!publique && borne.temperatureC != null && (
              <LigneInfo libelle="Température" valeur={`${formatNombre(borne.temperatureC, 0)} °C`} />
            )}
            {borne.fabricant && (
              <LigneInfo libelle="Matériel" valeur={[borne.fabricant, borne.modele].filter(Boolean).join(' ')} />
            )}
            {borne.versionOcpp && <LigneInfo libelle="Protocole" valeur={`OCPP ${borne.versionOcpp}`} />}
            <LigneInfo
              libelle="Coordonnées"
              valeur={`${formatNombre(borne.latitude, 4)}, ${formatNombre(borne.longitude, 4)}`}
            />
          </Carte>
        </View>
      </Animated.ScrollView>

      <View style={[styles.pied, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: insets.bottom + Espace.md }]}>
        {publique ? (
          <Bouton titre="Itinéraire" variante="secondaire" onPress={ouvrirItineraire} style={{ flex: 1 }} />
        ) : (
          <>
            <Bouton
              titre={maReservation ? 'Annuler' : 'Réserver'}
              variante="secondaire"
              desactive={horsService || !priseChoisie || (!!reservation && !maReservation)}
              chargement={action === 'reservation'}
              onPress={reserver}
              style={{ flex: 1 }}
            />
            <Bouton
              titre={horsService ? 'Indisponible' : priseChoisie ? `Démarrer · ${NOM_PRISE[priseChoisie.type]}` : 'Choisissez une prise'}
              desactive={horsService || !priseChoisie}
              chargement={action === 'demarrage'}
              onPress={demarrer}
              style={{ flex: 1.3 }}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  volta: { flexDirection: 'row', alignItems: 'center', gap: Espace.md, padding: Espace.lg, borderRadius: Rayons.lg, borderWidth: 1 },
  chargement: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Espace.lg },
  photoHero: { position: 'absolute', top: 0, left: 0, right: 0 },
  creditPhoto: { position: 'absolute', right: 16, bottom: 8, fontSize: 9, lineHeight: 12 },
  hero: {
    overflow: 'hidden',
    paddingHorizontal: Espace.xl,
    paddingBottom: Espace.xl,
    borderBottomLeftRadius: Rayons.xl,
    borderBottomRightRadius: Rayons.xl,
    gap: Espace.lg,
  },
  barre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 44 },
  favori: { borderWidth: 1, borderRadius: Rayons.pill, paddingHorizontal: 14, height: 34, justifyContent: 'center' },
  titres: { gap: 4 },
  chiffresHero: { flexDirection: 'row', borderTopWidth: 1, paddingTop: Espace.lg, gap: Espace.lg },
  chiffreHero: { flex: 1, gap: 4 },
  corps: { padding: Espace.xl, gap: Espace.lg },
  bandeau: { flexDirection: 'row', alignItems: 'center', gap: Espace.md, borderWidth: 1.5 },
  prises: { flexDirection: 'row', flexWrap: 'wrap', gap: Espace.md },
  priseConteneur: { flexBasis: '46%', flexGrow: 1 },
  prise: { borderWidth: 1.5, borderRadius: Rayons.lg, padding: 16, gap: 2 },
  kwPrise: { marginTop: 6 },
  planificateur: { gap: Espace.lg },
  estimations: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Espace.lg },
  estimation: { flex: 1, gap: 4 },
  infos: { gap: 14 },
  ligneInfo: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  chiffres: { fontVariant: ['tabular-nums'] },
  pied: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: Espace.md,
    paddingHorizontal: Espace.xl,
    paddingTop: Espace.md,
    borderTopWidth: 1,
  },
});
