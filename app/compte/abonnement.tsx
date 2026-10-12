import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Etiquette } from '@/components/compte';
import { Bouton } from '@/components/ui/bouton';
import { Carte } from '@/components/ui/carte';
import { Icone } from '@/components/ui/icone';
import { Squelette } from '@/components/ui/squelette';
import { SurfaceEncre } from '@/components/ui/surface-encre';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { payerEnLigne } from '@/lib/paiement-en-ligne';
import { confirmer, informer } from '@/lib/dialogue';
import { formatNombre, formatPrix } from '@/lib/format';
import type { Abonnement, Souscription } from '@/types/domain';

const dateLongue = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function Avantage({ texte }: { texte: string }) {
  return (
    <View style={styles.avantage}>
      <Icone name="check-circle" size={18} color="primary" />
      <Texte variant="body" style={{ flex: 1 }}>
        {texte}
      </Texte>
    </View>
  );
}

/** Formules d'abonnement : remise sur chaque recharge et kWh offerts chaque mois. */
export default function AbonnementScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { utilisateur, rafraichirProfil } = useAuth();

  const [formules, setFormules] = useState<Abonnement[] | null>(null);
  const [actuel, setActuel] = useState<Souscription | null>(null);
  const [action, setAction] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const [f, s] = await Promise.all([api.listeAbonnements(), api.souscriptionActive()]);
    setFormules(f);
    setActuel(s);
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger().catch(() => setFormules([]));
    }, [charger])
  );

  const souscrire = async (formule: Abonnement, methode: 'wallet' | 'carte') => {
    if (methode === 'carte') {
      setAction(`${formule.id}-carte`);
      try {
        if (await payerEnLigne({ objet: 'abonnement', abonnementId: formule.id, montant: formule.prixMensuel, nom: formule.nom })) {
          await Promise.all([charger(), rafraichirProfil()]);
        }
      } catch (e) {
        informer('Souscription impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
      } finally {
        setAction(null);
      }
      return;
    }
    const ok = await confirmer(
      `Souscrire à ${formule.nom} ?`,
      `${formatPrix(formule.prixMensuel)} par mois, ${
        methode === 'wallet' ? 'débités de votre wallet' : 'payés par carte bancaire (mode test)'
      }. Renouvellement automatique, résiliable à tout moment.`,
      { confirmer: 'Souscrire' }
    );
    if (!ok) return;
    setAction(`${formule.id}-${methode}`);
    try {
      await api.souscrire(formule.id, methode);
      await Promise.all([charger(), rafraichirProfil()]);
      informer('Abonnement activé', `Bienvenue dans la formule ${formule.nom} : vos remises s’appliquent dès la prochaine recharge.`);
    } catch (e) {
      informer('Souscription impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    } finally {
      setAction(null);
    }
  };

  const resilier = async () => {
    if (!actuel) return;
    const ok = await confirmer(
      'Arrêter le renouvellement ?',
      `Votre abonnement reste valable jusqu’au ${dateLongue(actuel.dateFin)}, puis il ne sera pas renouvelé.`,
      { confirmer: 'Résilier', destructif: true }
    );
    if (!ok) return;
    setAction('resiliation');
    try {
      await api.resilierAbonnement();
      await charger();
    } catch (e) {
      informer('Résiliation impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    } finally {
      setAction(null);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.contenu, { paddingBottom: insets.bottom + Espace.xxl }]}>
      {actuel && (
        <Animated.View entering={FadeInDown.duration(450)}>
          <SurfaceEncre style={styles.actuel}>
            <View style={styles.ligneHaut}>
              <Texte variant="label" color="electric">
                Votre abonnement
              </Texte>
              <Texte variant="captionStrong" color="onInkMuted">
                {actuel.renouvellementAuto ? 'Renouvellement auto' : 'Non renouvelé'}
              </Texte>
            </View>
            <Texte variant="title" color="onInk">
              {actuel.abonnementNom}
            </Texte>
            <View style={styles.chiffresActuel}>
              <View style={{ flex: 1, gap: 2 }}>
                <Texte variant="number" color="onInk">
                  {actuel.remisePourcent} %
                </Texte>
                <Texte variant="label" color="onInkMuted">
                  Remise
                </Texte>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Texte variant="number" color="onInk">
                  {formatNombre(actuel.kwhInclus)}
                </Texte>
                <Texte variant="label" color="onInkMuted">
                  kWh offerts / mois
                </Texte>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Texte variant="number" color="copper">
                  {formatNombre(actuel.prixMensuel, 0)}
                </Texte>
                <Texte variant="label" color="onInkMuted">
                  DT / mois
                </Texte>
              </View>
            </View>
            <Texte variant="caption" color="onInkMuted">
              Période en cours : du {dateLongue(actuel.dateDebut)} au {dateLongue(actuel.dateFin)}.
            </Texte>
            {actuel.renouvellementAuto && (
              <Bouton titre="Résilier" variante="surEncre" taille="compact" chargement={action === 'resiliation'} onPress={resilier} />
            )}
          </SurfaceEncre>
        </Animated.View>
      )}

      <Texte variant="heading">{actuel ? 'Les formules' : 'Choisissez votre formule'}</Texte>
      {!actuel && (
        <Texte variant="body" color="textMuted">
          Les kWh offerts sont décomptés en premier chaque mois, puis la remise s’applique à toutes vos recharges.
        </Texte>
      )}

      {formules === null
        ? [0, 1, 2].map((i) => <Squelette key={i} hauteur={190} rayon={Rayons.lg} />)
        : formules.map((f, i) => {
            const courante = actuel?.abonnementId === f.id;
            return (
              <Animated.View key={f.id} entering={FadeInDown.delay(i * 80).duration(400)}>
                <Carte style={{ ...styles.formule, borderColor: courante ? c.primary : c.border, borderWidth: courante ? 1.5 : 1 }}>
                  <View style={styles.ligneHaut}>
                    <Texte variant="heading">{f.nom}</Texte>
                    {courante && <Etiquette libelle="Formule actuelle" couleur="primary" />}
                  </View>
                  <View style={styles.prix}>
                    <Texte variant="title" color="copper" style={styles.chiffres}>
                      {formatNombre(f.prixMensuel, 0)}
                    </Texte>
                    <Texte variant="bodyStrong" color="textMuted">
                      DT / mois
                    </Texte>
                  </View>
                  {f.description && (
                    <Texte variant="caption" color="textMuted">
                      {f.description}
                    </Texte>
                  )}
                  <View style={{ gap: 6 }}>
                    <Avantage texte={`${f.remisePourcent} % de remise sur chaque recharge`} />
                    {f.kwhInclus > 0 && <Avantage texte={`${f.kwhInclus} kWh offerts chaque mois`} />}
                    <Avantage texte="Sans engagement, résiliable à tout moment" />
                  </View>
                  {!actuel && (
                    <View style={styles.actions}>
                      <Bouton
                        titre="Wallet"
                        icone="wallet-outline"
                        taille="compact"
                        desactive={(utilisateur?.soldeWallet ?? 0) < f.prixMensuel || action !== null}
                        chargement={action === `${f.id}-wallet`}
                        onPress={() => souscrire(f, 'wallet')}
                        style={{ flex: 1 }}
                      />
                      <Bouton
                        titre="Carte"
                        icone="credit-card-outline"
                        variante="secondaire"
                        taille="compact"
                        desactive={action !== null}
                        chargement={action === `${f.id}-carte`}
                        onPress={() => souscrire(f, 'carte')}
                        style={{ flex: 1 }}
                      />
                    </View>
                  )}
                </Carte>
              </Animated.View>
            );
          })}

      {actuel && (
        <Texte variant="caption" color="textMuted" align="center">
          Pour changer de formule, résiliez l’abonnement en cours : la nouvelle formule pourra être souscrite à son échéance.
        </Texte>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenu: { padding: Espace.xl, gap: Espace.lg },
  actuel: { borderRadius: Rayons.xl, padding: Espace.xl, gap: Espace.md },
  ligneHaut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Espace.md },
  chiffresActuel: { flexDirection: 'row', gap: Espace.md, paddingVertical: Espace.sm },
  formule: { gap: Espace.md },
  prix: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  avantage: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: Espace.sm },
  chiffres: { fontVariant: ['tabular-nums'] },
});
