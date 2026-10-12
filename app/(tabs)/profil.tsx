import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Etiquette, Groupe, Ligne } from '@/components/compte';
import { Bouton } from '@/components/ui/bouton';
import { Carte } from '@/components/ui/carte';
import { ChiffreAnime } from '@/components/ui/chiffre-anime';
import { Icone } from '@/components/ui/icone';
import { SurfaceEncre } from '@/components/ui/surface-encre';
import { Avatar } from '@/components/ui/avatar';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useGuide } from '@/contexts/guide-context';
import { useSoldeEnDirect } from '@/hooks/use-solde-en-direct';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { payerEnLigne } from '@/lib/paiement-en-ligne';
import { confirmer, informer } from '@/lib/dialogue';
import { capitaliser, formatPrix } from '@/lib/format';
import { STATUT_BADGE } from '@/lib/libelles';
import type { BadgeRfid, Paiement, Role, Souscription, Vehicule } from '@/types/domain';

const MONTANTS_RECHARGE = [10, 20, 50];

const LIBELLE_ROLE: Record<Role, string> = {
  super_admin: 'Administrateur',
  exploitant: 'Exploitant',
  operateur: 'Opérateur',
  technicien: 'Technicien',
  service_client: 'Service client',
  finance: 'Finance',
  client: 'Client',
};

export default function CompteScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { utilisateur, deconnexion, rafraichirProfil } = useAuth();
  const { solde, enCours } = useSoldeEnDirect();
  const { rejouer } = useGuide();

  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [badges, setBadges] = useState<BadgeRfid[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [souscription, setSouscription] = useState<Souscription | null>(null);
  const [rechargement, setRechargement] = useState<number | null>(null);

  const charger = useCallback(async () => {
    const [v, b, p, s] = await Promise.all([
      api.listeVehicules(),
      api.listeBadges(),
      api.listePaiements(),
      api.souscriptionActive(),
    ]);
    setVehicules(v);
    setBadges(b);
    setPaiements(p);
    setSouscription(s);
  }, []);

  useFocusEffect(
    useCallback(() => {
      rafraichirProfil().catch(() => undefined);
      charger().catch(() => undefined);
    }, [rafraichirProfil, charger])
  );

  const recharger = async (montant: number) => {
    setRechargement(montant);
    try {
      if (await payerEnLigne({ objet: 'recharge_wallet', montant })) await rafraichirProfil();
    } catch (e) {
      informer('Rechargement impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    } finally {
      setRechargement(null);
    }
  };

  const declarerPerte = async (badge: BadgeRfid) => {
    const ok = await confirmer(
      'Déclarer ce badge perdu ou volé ?',
      `Le badge ${badge.uid} sera immédiatement refusé par toutes les bornes. Le service client pourra vous en remettre un nouveau.`,
      { confirmer: 'Bloquer le badge', destructif: true }
    );
    if (!ok) return;
    try {
      await api.bloquerBadge(badge.id);
      await charger();
    } catch (e) {
      informer('Blocage impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    }
  };

  const seDeconnecter = async () => {
    const ok = await confirmer('Se déconnecter ?', 'Vous devrez saisir à nouveau vos identifiants.', {
      confirmer: 'Se déconnecter',
      destructif: true,
    });
    if (ok) await deconnexion();
  };

  const aRegler = paiements.filter((p) => p.statut === 'en_attente');
  const totalARegler = aRegler.reduce((s, p) => s + p.montant, 0);

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.contenu, { paddingTop: insets.top + Espace.lg }]}>
      <View style={styles.identite}>
        <Avatar utilisateur={utilisateur} taille={60} />
        <View style={{ flex: 1, gap: 2 }}>
          <Texte variant="heading" numberOfLines={1}>
            {capitaliser(utilisateur?.prenom)} {capitaliser(utilisateur?.nom)}
          </Texte>
          <Texte variant="caption" color="textMuted" numberOfLines={1}>
            {utilisateur?.email}
          </Texte>
          {utilisateur && utilisateur.role !== 'client' && (
            <Texte variant="captionStrong" color="textMuted">
              {LIBELLE_ROLE[utilisateur.role]}
            </Texte>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Afficher mon QR code"
          onPress={() => router.push('/compte/qr')}
          style={({ pressed }) => [styles.qr, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.7 : 1 }]}>
          <Icone name="qrcode" size={24} color="text" />
        </Pressable>
      </View>

      <Animated.View entering={FadeInDown.duration(450)}>
        <SurfaceEncre reflet style={styles.wallet}>
          <View style={styles.walletHaut}>
            <Texte variant="label" color="onInkMuted">
              Wallet Volteo
            </Texte>
            <Texte variant="label" color="electric">
              Paiement automatique
            </Texte>
          </View>
          <View>
            <Texte variant="caption" color="onInkMuted">
              Solde disponible
            </Texte>
            <View style={styles.solde}>
              <ChiffreAnime valeur={solde} decimales={2} variant="numberLarge" color="onInk" />
              <Texte variant="heading" color="copper">
                DT
              </Texte>
            </View>
            {enCours > 0 && (
              <Texte variant="caption" color="copper">
                Recharge en cours : −{formatPrix(enCours)}
              </Texte>
            )}
          </View>
          <View style={styles.walletActions}>
            {MONTANTS_RECHARGE.map((montant) => (
              <Bouton
                key={montant}
                titre={`+ ${montant} DT`}
                variante="surEncre"
                taille="compact"
                chargement={rechargement === montant}
                desactive={rechargement !== null && rechargement !== montant}
                onPress={() => recharger(montant)}
                style={{ flex: 1 }}
              />
            ))}
          </View>
          <Texte variant="caption" color="onInkMuted">
            Chaque recharge est débitée à l’arrêt de la session. Mode test : crédit immédiat, sans paiement réel.
          </Texte>
        </SurfaceEncre>
      </Animated.View>

      {aRegler.length > 0 && (
        <Animated.View entering={FadeInDown.duration(400)}>
          <Carte onPress={() => router.push('/compte/paiements')} style={{ ...styles.bandeau, borderColor: c.warning }}>
            <Icone name="alert-circle-outline" size={26} color="warning" />
            <View style={{ flex: 1, gap: 2 }}>
              <Texte variant="subheading">{formatPrix(totalARegler)} à régler</Texte>
              <Texte variant="caption" color="textMuted">
                {aRegler.length === 1 ? 'Une recharge' : `${aRegler.length} recharges`} terminée(s) avec un solde insuffisant.
              </Texte>
            </View>
            <Texte variant="captionStrong" color="primary">
              Régler
            </Texte>
          </Carte>
        </Animated.View>
      )}

      <Carte onPress={() => router.push('/compte/abonnement')} style={styles.abonnement}>
        <View style={[styles.iconeAbo, { backgroundColor: c.primarySoft }]}>
          <Icone name="crown-outline" size={22} color="primary" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Texte variant="label" color="textMuted">
            Abonnement
          </Texte>
          {souscription ? (
            <>
              <Texte variant="subheading">{souscription.abonnementNom}</Texte>
              <Texte variant="caption" color="textMuted">
                {souscription.remisePourcent} % de remise
                {souscription.kwhInclus > 0 ? ` · ${souscription.kwhInclus} kWh offerts / mois` : ''}
              </Texte>
            </>
          ) : (
            <>
              <Texte variant="subheading">Aucun abonnement</Texte>
              <Texte variant="caption" color="textMuted">
                Rechargez moins cher avec une formule mensuelle.
              </Texte>
            </>
          )}
        </View>
        <Icone name="chevron-right" size={20} color="textFaint" />
      </Carte>

      <Groupe titre="Mon compte">
        <Ligne
          icone="car-electric-outline"
          titre="Mes véhicules"
          detail={
            vehicules.length
              ? vehicules.map((v) => `${v.marque} ${v.modele}`).join(', ')
              : 'Ajoutez votre véhicule pour des estimations précises'
          }
          onPress={() => router.push('/compte/vehicules')}
        />
        <Ligne
          icone="receipt-text-outline"
          titre="Paiements et factures"
          detail="Historique, factures PDF, paiements différés"
          onPress={() => router.push('/compte/paiements')}
        />
        <Ligne
          icone="shield-account-outline"
          titre="Profil et sécurité"
          detail={utilisateur?.deuxFacteurs ? 'Double authentification activée' : 'Coordonnées, mot de passe, double authentification'}
          onPress={() => router.push('/compte/securite')}
        />
        <Ligne
          icone="qrcode"
          titre="Mon QR code"
          detail="Pour vous identifier à la borne ou en agence"
          onPress={() => router.push('/compte/qr')}
        />
        <Ligne
          icone="compass-outline"
          titre="Revoir le guide"
          detail="Présentation animée de l’app et visite des onglets"
          onPress={() => {
            router.navigate('/');
            rejouer();
          }}
        />
      </Groupe>

      <Groupe titre="Badges RFID" vide="Aucun badge. Le service client peut vous en attribuer un.">
        {badges.map((b) => {
          const statut = STATUT_BADGE[b.statut ?? (b.actif ? 'actif' : 'bloque')];
          return (
            <Ligne
              key={b.id}
              icone="card-account-details-outline"
              titre={b.libelle ? `${b.libelle} · ${b.uid}` : b.uid}
              detail={
                b.statut === 'actif'
                  ? `${b.dateExpiration ? `Valable jusqu’au ${new Date(b.dateExpiration).toLocaleDateString('fr-FR')}` : 'Sans date d’expiration'} · touchez en cas de perte`
                  : b.dateExpiration
                    ? `Expiration : ${new Date(b.dateExpiration).toLocaleDateString('fr-FR')}`
                    : undefined
              }
              onPress={b.statut === 'actif' ? () => declarerPerte(b) : undefined}
              chevron={false}
              droite={<Etiquette libelle={statut.label} couleur={statut.couleur} />}
            />
          );
        })}
      </Groupe>

      <Bouton titre="Se déconnecter" variante="danger" onPress={seDeconnecter} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenu: { paddingHorizontal: Espace.xl, paddingBottom: Espace.xxxl, gap: Espace.xl },
  identite: { flexDirection: 'row', alignItems: 'center', gap: Espace.md },
  qr: { width: 48, height: 48, borderRadius: Rayons.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  wallet: { borderRadius: Rayons.xl, padding: Espace.xl, gap: Espace.lg },
  walletHaut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  solde: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  walletActions: { flexDirection: 'row', gap: Espace.sm },
  bandeau: { flexDirection: 'row', alignItems: 'center', gap: Espace.md, borderWidth: 1.5 },
  abonnement: { flexDirection: 'row', alignItems: 'center', gap: Espace.md },
  iconeAbo: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
