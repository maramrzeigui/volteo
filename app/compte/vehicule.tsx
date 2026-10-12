import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NOM_PRISE } from '@/components/borne-card';
import { Message } from '@/components/compte';
import { Bouton } from '@/components/ui/bouton';
import { Champ } from '@/components/ui/champ';
import { ICONE_CONNECTEUR } from '@/components/ui/icone';
import { Pastille } from '@/components/ui/pastille';
import { Texte } from '@/components/ui/texte';
import { Cascade } from '@/components/ui/cascade';
import { Espace } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import type { TypeConnecteur } from '@/types/domain';

const TYPES: TypeConnecteur[] = ['CCS', 'Type2', 'CHAdeMO', 'AC', 'DC'];
const CAPACITES = [40, 50, 60, 77, 100];

/** Ajout (sans `id`) ou modification d'un véhicule. */
export default function VehiculeFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  const [marque, setMarque] = useState('');
  const [modele, setModele] = useState('');
  const [immatriculation, setImmatriculation] = useState('');
  const [type, setType] = useState<TypeConnecteur>('CCS');
  const [capacite, setCapacite] = useState('60');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .listeVehicules()
      .then((liste) => {
        const v = liste.find((x) => x.id === Number(id));
        if (!v) return;
        setMarque(v.marque);
        setModele(v.modele);
        setImmatriculation(v.immatriculation);
        setType(v.typeConnecteur);
        setCapacite(String(v.capaciteBatterieKwh));
      })
      .catch(() => undefined);
  }, [id]);

  const enregistrer = async () => {
    setErreur(null);
    const kwh = Number(capacite.replace(',', '.'));
    if (!marque.trim() || !modele.trim() || !immatriculation.trim()) {
      setErreur('Renseignez la marque, le modèle et l’immatriculation.');
      return;
    }
    if (!Number.isFinite(kwh) || kwh < 1 || kwh > 300) {
      setErreur('La capacité de la batterie doit être comprise entre 1 et 300 kWh.');
      return;
    }
    setEnCours(true);
    try {
      await api.enregistrerVehicule(
        {
          marque: marque.trim(),
          modele: modele.trim(),
          immatriculation: immatriculation.trim(),
          typeConnecteur: type,
          capaciteBatterieKwh: Math.round(kwh),
        },
        id ? Number(id) : undefined
      );
      // Ouvert depuis un lien direct (sans historique) : retour à la liste.
      if (router.canGoBack()) router.back();
      else router.replace('/compte/vehicules');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: id ? 'Modifier le véhicule' : 'Nouveau véhicule' }} />
      <ScrollView
        style={{ backgroundColor: c.background }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.contenu, { paddingBottom: insets.bottom + Espace.xxl }]}>
        <Cascade>
          <View style={styles.rangee}>
            <View style={{ flex: 1 }}>
              <Champ label="Marque" placeholder="Renault" value={marque} onChangeText={setMarque} />
            </View>
            <View style={{ flex: 1 }}>
              <Champ label="Modèle" placeholder="Mégane E-Tech" value={modele} onChangeText={setModele} />
            </View>
          </View>
          <Champ
            label="Immatriculation"
            placeholder="220 TU 4521"
            autoCapitalize="characters"
            value={immatriculation}
            onChangeText={setImmatriculation}
          />

          <View style={styles.bloc}>
            <Texte variant="captionStrong" color="textMuted">
              Type de prise
            </Texte>
            <View style={styles.choix}>
              {TYPES.map((t) => (
                <Pastille
                  key={t}
                  libelle={NOM_PRISE[t] ?? t}
                  icone={ICONE_CONNECTEUR[t]}
                  actif={type === t}
                  onPress={() => setType(t)}
                />
              ))}
            </View>
          </View>

          <View style={styles.bloc}>
            <Champ
              label="Capacité de la batterie (kWh)"
              keyboardType="decimal-pad"
              value={capacite}
              onChangeText={setCapacite}
            />
            <View style={styles.choix}>
              {CAPACITES.map((k) => (
                <Pastille key={k} libelle={`${k} kWh`} actif={capacite === String(k)} onPress={() => setCapacite(String(k))} />
              ))}
            </View>
          </View>

          <Message texte={erreur} />
          <Bouton titre={id ? 'Enregistrer' : 'Ajouter le véhicule'} chargement={enCours} onPress={enregistrer} />
        </Cascade>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenu: { padding: Espace.xl, gap: Espace.lg },
  rangee: { flexDirection: 'row', gap: Espace.md },
  bloc: { gap: Espace.sm },
  choix: { flexDirection: 'row', flexWrap: 'wrap', gap: Espace.sm },
});
