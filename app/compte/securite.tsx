import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Message } from '@/components/compte';
import { Bouton } from '@/components/ui/bouton';
import { Carte } from '@/components/ui/carte';
import { Champ } from '@/components/ui/champ';
import { Texte } from '@/components/ui/texte';
import { Cascade } from '@/components/ui/cascade';
import { Espace } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';

type Retour = { texte: string; type: 'danger' | 'success' } | null;

/** Module 1 — coordonnées, mot de passe et double authentification. */
export default function SecuriteScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { utilisateur, rafraichirProfil } = useAuth();

  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [retourInfos, setRetourInfos] = useState<Retour>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [retourMdp, setRetourMdp] = useState<Retour>(null);
  const [changement, setChangement] = useState(false);

  const [deuxFacteurs, setDeuxFacteurs] = useState(false);
  const [bascule2fa, setBascule2fa] = useState(false);

  useEffect(() => {
    if (!utilisateur) return;
    setPrenom(utilisateur.prenom ?? '');
    setNom(utilisateur.nom ?? '');
    setEmail(utilisateur.email ?? '');
    setTelephone(utilisateur.telephone ?? '');
    setDeuxFacteurs(!!utilisateur.deuxFacteurs);
  }, [utilisateur]);

  const enregistrerInfos = async () => {
    setRetourInfos(null);
    if (!prenom.trim() || !nom.trim() || !email.trim()) {
      setRetourInfos({ texte: 'Le prénom, le nom et l’email sont obligatoires.', type: 'danger' });
      return;
    }
    setEnregistrement(true);
    try {
      await api.mettreAJourProfil({
        prenom: prenom.trim(),
        nom: nom.trim(),
        email: email.trim(),
        telephone: telephone.trim() || null,
      });
      await rafraichirProfil();
      setRetourInfos({ texte: 'Vos informations sont à jour.', type: 'success' });
    } catch (e) {
      setRetourInfos({ texte: e instanceof Error ? e.message : 'Enregistrement impossible', type: 'danger' });
    } finally {
      setEnregistrement(false);
    }
  };

  const changerMotDePasse = async () => {
    setRetourMdp(null);
    if (nouveau.length < 8) {
      setRetourMdp({ texte: 'Le nouveau mot de passe doit contenir au moins 8 caractères.', type: 'danger' });
      return;
    }
    if (nouveau !== confirmation) {
      setRetourMdp({ texte: 'Les deux mots de passe ne sont pas identiques.', type: 'danger' });
      return;
    }
    setChangement(true);
    try {
      await api.changerMotDePasse(actuel, nouveau);
      setActuel('');
      setNouveau('');
      setConfirmation('');
      setRetourMdp({ texte: 'Mot de passe modifié.', type: 'success' });
    } catch (e) {
      setRetourMdp({ texte: e instanceof Error ? e.message : 'Modification impossible', type: 'danger' });
    } finally {
      setChangement(false);
    }
  };

  const basculer2fa = async (actif: boolean) => {
    setDeuxFacteurs(actif);
    setBascule2fa(true);
    try {
      await api.definirDeuxFacteurs(actif);
      await rafraichirProfil();
    } catch {
      setDeuxFacteurs(!actif);
    } finally {
      setBascule2fa(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: c.background }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.contenu, { paddingBottom: insets.bottom + Espace.xxl }]}>
        <Cascade>
          <Texte variant="heading">Informations personnelles</Texte>
          <Carte style={styles.bloc}>
            <View style={styles.rangee}>
              <View style={{ flex: 1 }}>
                <Champ label="Prénom" value={prenom} onChangeText={setPrenom} />
              </View>
              <View style={{ flex: 1 }}>
                <Champ label="Nom" value={nom} onChangeText={setNom} />
              </View>
            </View>
            <Champ
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <Champ
              label="Téléphone"
              placeholder="+216 …"
              keyboardType="phone-pad"
              autoComplete="tel"
              value={telephone}
              onChangeText={setTelephone}
            />
            <Message texte={retourInfos?.texte ?? null} type={retourInfos?.type} />
            <Bouton titre="Enregistrer" chargement={enregistrement} onPress={enregistrerInfos} />
          </Carte>

          <Texte variant="heading">Double authentification</Texte>
          <Carte style={styles.deuxFacteurs}>
            <View style={{ flex: 1, gap: 4 }}>
              <Texte variant="subheading">Code de connexion par email</Texte>
              <Texte variant="caption" color="textMuted">
                À chaque connexion, un code à 6 chiffres est envoyé à {utilisateur?.email}. Recommandé pour protéger votre wallet.
              </Texte>
            </View>
            <Switch
              value={deuxFacteurs}
              disabled={bascule2fa}
              onValueChange={basculer2fa}
              trackColor={{ true: c.primary, false: c.border }}
              accessibilityLabel="Double authentification"
            />
          </Carte>

          <Texte variant="heading">Mot de passe</Texte>
          <Carte style={styles.bloc}>
            <Champ label="Mot de passe actuel" motDePasse autoComplete="current-password" value={actuel} onChangeText={setActuel} />
            <Champ
              label="Nouveau mot de passe"
              placeholder="8 caractères minimum"
              motDePasse
              autoComplete="new-password"
              value={nouveau}
              onChangeText={setNouveau}
            />
            <Champ
              label="Confirmer le nouveau mot de passe"
              motDePasse
              autoComplete="new-password"
              value={confirmation}
              onChangeText={setConfirmation}
              onSubmitEditing={changerMotDePasse}
            />
            <Message texte={retourMdp?.texte ?? null} type={retourMdp?.type} />
            <Bouton
              titre="Changer le mot de passe"
              variante="secondaire"
              desactive={!actuel || !nouveau}
              chargement={changement}
              onPress={changerMotDePasse}
            />
          </Carte>
        </Cascade>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenu: { padding: Espace.xl, gap: Espace.lg },
  bloc: { gap: Espace.lg },
  rangee: { flexDirection: 'row', gap: Espace.md },
  deuxFacteurs: { flexDirection: 'row', alignItems: 'center', gap: Espace.md },
});
