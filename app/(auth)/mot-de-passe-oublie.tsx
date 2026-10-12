import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthLayout } from '@/components/auth-layout';
import { Bouton } from '@/components/ui/bouton';
import { Champ } from '@/components/ui/champ';
import { Texte } from '@/components/ui/texte';
import { Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';

export default function MotDePasseOublieScreen() {
  const { c } = useTheme();

  const [etape, setEtape] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const envoyerCode = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      await api.motDePasseOublie(email.trim());
      setEtape('code');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Envoi impossible');
    } finally {
      setEnCours(false);
    }
  };

  const reinitialiser = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      await api.reinitialiserMotDePasse(email.trim(), code.trim(), motDePasse);
      router.replace('/login');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Réinitialisation impossible');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <AuthLayout
      retour
      titre={etape === 'email' ? 'Mot de passe oublié' : 'Nouveau mot de passe'}
      sousTitre={
        etape === 'email'
          ? 'Indiquez votre email : nous vous envoyons un code pour choisir un nouveau mot de passe.'
          : `Si un compte existe pour ${email.trim()}, un code à 6 chiffres vient d’y être envoyé.`
      }>
      {etape === 'email' ? (
        <Champ
          label="Email"
          placeholder="vous@exemple.tn"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={envoyerCode}
        />
      ) : (
        <>
          <Champ
            label="Code reçu par email"
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
          />
          <Champ
            label="Nouveau mot de passe"
            placeholder="8 caractères minimum"
            motDePasse
            value={motDePasse}
            onChangeText={setMotDePasse}
            onSubmitEditing={reinitialiser}
          />
        </>
      )}

      {erreur && (
        <View style={[styles.erreur, { backgroundColor: `${c.danger}14` }]}>
          <Texte variant="captionStrong" color="danger" style={{ flex: 1 }}>
            {erreur}
          </Texte>
        </View>
      )}

      <Bouton
        titre={etape === 'email' ? 'Recevoir un code' : 'Enregistrer le mot de passe'}
        chargement={enCours}
        onPress={etape === 'email' ? envoyerCode : reinitialiser}
      />
      {etape === 'code' && (
        <Bouton titre="Renvoyer un code" variante="fantome" onPress={envoyerCode} />
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  erreur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Rayons.md,
    padding: 12,
  },
});
