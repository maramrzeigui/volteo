import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bouton } from '@/components/ui/bouton';
import { Carte } from '@/components/ui/carte';
import { Champ } from '@/components/ui/champ';
import { Icone } from '@/components/ui/icone';
import { Pastille } from '@/components/ui/pastille';
import { Squelette } from '@/components/ui/squelette';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { confirmer, informer } from '@/lib/dialogue';
import type { Vehicule } from '@/types/domain';

const court = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Volteo Chain — « Ma batterie » : le conducteur active la batterie de son véhicule avec le code
 * de sa facture (le NFT lui est transféré), voit son passeport blockchain et peut la céder à la revente.
 */
export default function BatterieScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [batteries, setBatteries] = useState<api.BatterieCertifiee[] | null>(null);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [parVin, setParVin] = useState(false);
  const [identifiant, setIdentifiant] = useState('');
  const [code, setCode] = useState('');
  const [vehiculeId, setVehiculeId] = useState<number | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [acheteur, setAcheteur] = useState('');

  const charger = useCallback(() => {
    api.mesBatteries().then(setBatteries).catch(() => setBatteries([]));
    api
      .listeVehicules()
      .then((v) => {
        setVehicules(v);
        setVehiculeId((id) => id ?? v[0]?.id ?? null);
      })
      .catch(() => setVehicules([]));
  }, []);

  useFocusEffect(charger);

  const activer = async () => {
    if (!identifiant.trim() || !code.trim() || !vehiculeId) {
      informer('Champs manquants', 'Renseignez la batterie, le code d’activation et le véhicule.');
      return;
    }
    setEnvoi(true);
    try {
      const r = await api.activerBatterie({
        [parVin ? 'vin' : 'numSerie']: identifiant.trim(),
        code: code.trim(),
        vehiculeId,
      });
      informer('Batterie certifiée', `NFT n° ${r.data.tokenId} : vous êtes maintenant le propriétaire de cette batterie.`, 'shield-check');
      setIdentifiant('');
      setCode('');
      charger();
    } catch (e) {
      informer('Activation impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    } finally {
      setEnvoi(false);
    }
  };

  const ceder = async (b: api.BatterieCertifiee) => {
    if (!acheteur.trim()) {
      informer('E-mail requis', 'Saisissez l’e-mail du compte Volteo de l’acheteur.');
      return;
    }
    const ok = await confirmer('Céder la batterie ?', `Le NFT et tout l’historique passent à ${acheteur.trim()}. Action définitive.`, {
      confirmer: 'Transférer',
      destructif: true,
    });
    if (!ok) return;
    try {
      informer('Batterie cédée', await api.cederBatterie(b.id, acheteur.trim()));
      setAcheteur('');
      charger();
    } catch (e) {
      informer('Transfert impossible', e instanceof Error ? e.message : 'Réessayez dans un instant.');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: c.background }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.contenu, { paddingBottom: insets.bottom + Espace.xxl }]}>
        <Texte variant="body" color="textMuted">
          Votre batterie a un passeport infalsifiable dans la blockchain. Chaque recharge sur une borne Volteo y est
          certifiée par la station.
        </Texte>

        {batteries === null ? (
          <Squelette hauteur={220} rayon={Rayons.lg} />
        ) : (
          batteries.map((b, i) => {
            const p = b.passeport;
            return (
              <Animated.View key={b.id} entering={FadeInDown.delay(i * 70).duration(400)}>
                <Carte style={styles.carte}>
                  <View style={styles.haut}>
                    <View style={[styles.icone, { backgroundColor: c.primarySoft }]}>
                      <Icone name="shield-check" size={26} color="primary" />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Texte variant="subheading" numberOfLines={1}>
                        {b.modele}
                      </Texte>
                      <Texte variant="caption" color="textMuted">
                        {b.numSerie} · NFT n° {b.tokenId}
                        {b.vehicule ? ` · ${b.vehicule}` : ''}
                      </Texte>
                    </View>
                  </View>

                  {p ? (
                    <>
                      <View style={styles.chiffres}>
                        <Indicateur valeur={`${p.soh} %`} libelle="Santé (SoH)" />
                        <Indicateur valeur={String(p.nbRecharges)} libelle="Recharges certifiées" />
                        <Indicateur valeur={`${p.energieTotaleKWh.toFixed(1)}`} libelle="kWh certifiés" />
                        <Indicateur valeur={p.cycles.toFixed(2)} libelle="Cycles" />
                      </View>
                      <Texte variant="label" color="textMuted">
                        Recharges certifiées
                      </Texte>
                      {p.recharges.length === 0 ? (
                        <Texte variant="caption" color="textMuted">
                          Aucune recharge pour l’instant : votre prochaine recharge Volteo sera certifiée ici.
                        </Texte>
                      ) : (
                        p.recharges
                          .slice()
                          .reverse()
                          .slice(0, 10)
                          .map((r) => (
                            <View key={r.sessionId} style={[styles.recharge, { borderColor: c.border }]}>
                              <Icone name="check-decagram" size={18} color="primary" />
                              <View style={{ flex: 1 }}>
                                <Texte variant="captionStrong">
                                  {r.nomStation || court(r.station)} · {r.borne}
                                </Texte>
                                <Texte variant="caption" color="textMuted">
                                  {date(r.fin)}
                                </Texte>
                              </View>
                              <Texte variant="captionStrong">{r.energieKWh.toFixed(2)} kWh</Texte>
                            </View>
                          ))
                      )}
                      <Texte variant="caption" color="textFaint">
                        Propriétaire {court(p.proprietaire)} · contrat {court(p.contrat)}
                      </Texte>
                    </>
                  ) : (
                    <Texte variant="caption" color="textMuted">
                      Blockchain injoignable : passeport momentanément indisponible.
                    </Texte>
                  )}

                  <Champ
                    label="Revente : e-mail de l’acheteur (compte Volteo)"
                    placeholder="acheteur@email.tn"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={acheteur}
                    onChangeText={setAcheteur}
                  />
                  <Bouton titre="Céder la batterie" icone="swap-horizontal" variante="secondaire" taille="compact" onPress={() => ceder(b)} />
                </Carte>
              </Animated.View>
            );
          })
        )}

        <Carte style={styles.carte}>
          <Texte variant="subheading">Activer la batterie de mon véhicule</Texte>
          {vehicules.length === 0 ? (
            <>
              <Texte variant="caption" color="textMuted">
                Ajoutez d’abord votre véhicule, puis revenez activer sa batterie.
              </Texte>
              <Bouton titre="Ajouter un véhicule" icone="plus" onPress={() => router.push('/compte/vehicule')} />
            </>
          ) : (
            <>
              <View style={styles.choix}>
                <Pastille libelle="N° de série / QR" actif={!parVin} onPress={() => setParVin(false)} />
                <Pastille libelle="VIN" actif={parVin} onPress={() => setParVin(true)} />
              </View>
              <Champ
                label={parVin ? 'VIN de la voiture (carte grise)' : 'Numéro de série (étiquette de la batterie)'}
                placeholder={parVin ? 'VF1RCB00012345678' : 'BAT-2026-00017'}
                autoCapitalize="characters"
                value={identifiant}
                onChangeText={setIdentifiant}
              />
              <Champ label="Code d’activation (facture)" placeholder="K7M2-9QX4" autoCapitalize="characters" value={code} onChangeText={setCode} />
              <Texte variant="captionStrong" color="textMuted">
                Véhicule
              </Texte>
              <View style={styles.choix}>
                {vehicules.map((v) => (
                  <Pastille key={v.id} libelle={`${v.marque} ${v.modele}`} actif={vehiculeId === v.id} onPress={() => setVehiculeId(v.id)} />
                ))}
              </View>
              <Bouton titre="Activer et recevoir le NFT" icone="shield-check-outline" onPress={activer} chargement={envoi} />
            </>
          )}
        </Carte>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Indicateur({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <View style={styles.indicateur}>
      <Texte variant="number">{valeur}</Texte>
      <Texte variant="caption" color="textMuted" align="center">
        {libelle}
      </Texte>
    </View>
  );
}

const styles = StyleSheet.create({
  contenu: { padding: Espace.xl, gap: Espace.lg },
  carte: { gap: Espace.md },
  haut: { flexDirection: 'row', alignItems: 'center', gap: Espace.md },
  icone: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chiffres: { flexDirection: 'row', justifyContent: 'space-between', gap: Espace.sm },
  indicateur: { flex: 1, alignItems: 'center', gap: 2 },
  recharge: { flexDirection: 'row', alignItems: 'center', gap: Espace.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Espace.sm },
  choix: { flexDirection: 'row', flexWrap: 'wrap', gap: Espace.sm },
});
