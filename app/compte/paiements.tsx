import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Etiquette, Groupe, Ligne } from '@/components/compte';
import { Bouton } from '@/components/ui/bouton';
import { Carte } from '@/components/ui/carte';
import { Pastille } from '@/components/ui/pastille';
import { Squelette } from '@/components/ui/squelette';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { payerEnLigne } from '@/lib/paiement-en-ligne';
import { confirmer, informer } from '@/lib/dialogue';
import { ouvrirFacture } from '@/lib/factures';
import { formatPrix } from '@/lib/format';
import { METHODE_PAIEMENT, STATUT_FACTURE, STATUT_PAIEMENT } from '@/lib/libelles';
import type { Facture, Paiement } from '@/types/domain';

const dateCourte = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** Module 9 — paiements (wallet, carte, abonnement, différé), factures PDF et historique. */
export default function PaiementsScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { utilisateur, rafraichirProfil } = useAuth();

  const [onglet, setOnglet] = useState<'paiements' | 'factures'>('paiements');
  const [paiements, setPaiements] = useState<Paiement[] | null>(null);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [reglement, setReglement] = useState<string | null>(null);
  const [telechargement, setTelechargement] = useState<number | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(async () => {
    const [p, f] = await Promise.all([api.listePaiements(), api.listeFactures()]);
    setPaiements(p);
    setFactures(f);
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger().catch(() => setPaiements([]));
    }, [charger])
  );

  const regler = async (paiement: Paiement, methode: 'wallet' | 'carte') => {
    if (methode === 'carte') {
      setReglement(`${paiement.id}-carte`);
      try {
        if (await payerEnLigne({ objet: 'reglement', paiementId: paiement.id, montant: paiement.montant })) await Promise.all([charger(), rafraichirProfil()]);
      } catch (e) {
        informer('Paiement impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
      } finally {
        setReglement(null);
      }
      return;
    }
    const ok = await confirmer(
      `Régler ${formatPrix(paiement.montant)} ?`,
      methode === 'wallet'
        ? `Le montant sera débité de votre wallet (solde : ${formatPrix(utilisateur?.soldeWallet)}).`
        : 'Paiement par carte bancaire via notre prestataire (mode test : aucun débit réel).',
      { confirmer: 'Payer' }
    );
    if (!ok) return;
    setReglement(`${paiement.id}-${methode}`);
    try {
      await api.reglerPaiement(paiement.id, methode);
      await Promise.all([charger(), rafraichirProfil()]);
    } catch (e) {
      informer('Paiement impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    } finally {
      setReglement(null);
    }
  };

  const telecharger = async (facture: Facture) => {
    setTelechargement(facture.id);
    try {
      await ouvrirFacture(facture);
    } catch (e) {
      informer('Téléchargement impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    } finally {
      setTelechargement(null);
    }
  };

  const aRegler = (paiements ?? []).filter((p) => p.statut === 'en_attente');
  const historique = (paiements ?? []).filter((p) => p.statut !== 'en_attente');

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.contenu, { paddingBottom: insets.bottom + Espace.xxl }]}
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
      {aRegler.length > 0 && (
        <View style={styles.section}>
          <Texte variant="heading">À régler</Texte>
          {aRegler.map((p, i) => (
            <Animated.View key={p.id} entering={FadeInDown.delay(i * 60).duration(400)}>
              <Carte style={{ ...styles.aRegler, borderColor: c.warning }}>
                <View style={styles.ligneHaut}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Texte variant="subheading">{p.objet}</Texte>
                    <Texte variant="caption" color="textMuted">
                      {dateCourte(p.date)} · solde insuffisant en fin de recharge
                    </Texte>
                  </View>
                  <Texte variant="number" color="copper" style={styles.chiffres}>
                    {formatPrix(p.montant)}
                  </Texte>
                </View>
                <View style={styles.actions}>
                  <Bouton
                    titre="Wallet"
                    icone="wallet-outline"
                    taille="compact"
                    desactive={(utilisateur?.soldeWallet ?? 0) < p.montant || reglement !== null}
                    chargement={reglement === `${p.id}-wallet`}
                    onPress={() => regler(p, 'wallet')}
                    style={{ flex: 1 }}
                  />
                  <Bouton
                    titre="Carte bancaire"
                    icone="credit-card-outline"
                    variante="secondaire"
                    taille="compact"
                    desactive={reglement !== null}
                    chargement={reglement === `${p.id}-carte`}
                    onPress={() => regler(p, 'carte')}
                    style={{ flex: 1 }}
                  />
                </View>
                {(utilisateur?.soldeWallet ?? 0) < p.montant && (
                  <Texte variant="caption" color="textMuted">
                    Solde du wallet insuffisant : rechargez-le depuis l’onglet Compte ou payez par carte.
                  </Texte>
                )}
              </Carte>
            </Animated.View>
          ))}
        </View>
      )}

      <View style={styles.onglets}>
        <Pastille libelle="Paiements" actif={onglet === 'paiements'} compteur={historique.length} onPress={() => setOnglet('paiements')} />
        <Pastille libelle="Factures" actif={onglet === 'factures'} compteur={factures.length} onPress={() => setOnglet('factures')} />
      </View>

      {paiements === null ? (
        <Squelette hauteur={220} rayon={Rayons.lg} />
      ) : onglet === 'paiements' ? (
        <Groupe vide="Aucun paiement pour le moment">
          {historique.map((p) => {
            const statut = STATUT_PAIEMENT[p.statut];
            const credit = p.methode.startsWith('topup_') || (p.methode === 'ajustement' && p.montant > 0);
            return (
              <Ligne
                key={p.id}
                icone={credit ? 'arrow-down-bold-circle-outline' : p.souscriptionId ? 'crown-outline' : 'ev-station'}
                titre={p.objet}
                detail={`${dateCourte(p.date)} · ${METHODE_PAIEMENT[p.methode] ?? p.methode}${
                  p.montantRembourse > 0 ? ` · ${formatPrix(p.montantRembourse)} remboursé` : ''
                }`}
                droite={
                  <View style={styles.droite}>
                    <Texte variant="bodyStrong" color={credit ? 'success' : 'text'} style={styles.chiffres}>
                      {credit ? '+' : '−'} {formatPrix(Math.abs(p.montant))}
                    </Texte>
                    {p.statut !== 'paye' && <Etiquette libelle={statut.label} couleur={statut.couleur} />}
                  </View>
                }
              />
            );
          })}
        </Groupe>
      ) : (
        <Groupe vide="Vos factures apparaîtront après votre première recharge">
          {factures.map((f) => {
            const statut = STATUT_FACTURE[f.statut ?? 'payee'];
            return (
              <Ligne
                key={f.id}
                icone="file-pdf-box"
                titre={f.numero}
                detail={`${dateCourte(f.date)}${f.montantTva != null ? ` · dont TVA ${formatPrix(f.montantTva)}` : ''}`}
                onPress={() => telecharger(f)}
                chevron={false}
                droite={
                  telechargement === f.id ? (
                    <ActivityIndicator size="small" color={c.primary} />
                  ) : (
                    <View style={styles.droite}>
                      <Texte variant="bodyStrong" style={styles.chiffres}>
                        {formatPrix(f.montantTtc)}
                      </Texte>
                      {statut && <Etiquette libelle={statut.label} couleur={statut.couleur} />}
                    </View>
                  )
                }
              />
            );
          })}
        </Groupe>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenu: { padding: Espace.xl, gap: Espace.lg },
  section: { gap: Espace.md },
  aRegler: { gap: Espace.md, borderWidth: 1.5 },
  ligneHaut: { flexDirection: 'row', alignItems: 'center', gap: Espace.md },
  actions: { flexDirection: 'row', gap: Espace.sm },
  onglets: { flexDirection: 'row', gap: Espace.sm },
  droite: { alignItems: 'flex-end', gap: 4 },
  chiffres: { fontVariant: ['tabular-nums'] },
});
