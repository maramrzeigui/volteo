import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BoutonGoogle, SeparateurOu } from '@/components/auth/bouton-google';
import { AuthLayout } from '@/components/auth-layout';
import { Bouton } from '@/components/ui/bouton';
import { Champ } from '@/components/ui/champ';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

export default function RegisterScreen() {
  const { c } = useTheme();
  const { inscription } = useAuth();

  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const valider = async () => {
    setErreur(null);
    if (!prenom || !nom || !email || !motDePasse) {
      setErreur('Remplissez tous les champs pour créer votre compte.');
      return;
    }
    if (motDePasse.length < 8) {
      setErreur('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne sont pas identiques.');
      return;
    }
    setEnCours(true);
    try {
      await inscription({ nom, prenom, email: email.trim(), telephone: telephone.trim() || undefined, motDePasse });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Inscription impossible');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <AuthLayout
      retour
      titre="Créer un compte"
      sousTitre="Quelques secondes suffisent pour lancer votre première recharge.">
      <View style={styles.rangee}>
        <View style={{ flex: 1 }}>
          <Champ label="Prénom" placeholder="Maram" value={prenom} onChangeText={setPrenom} />
        </View>
        <View style={{ flex: 1 }}>
          <Champ label="Nom" placeholder="Rzeigui" value={nom} onChangeText={setNom} />
        </View>
      </View>
      <Champ
        label="Email"
        placeholder="vous@exemple.tn"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Champ
        label="Téléphone (facultatif)"
        placeholder="+216 20 000 000"
        keyboardType="phone-pad"
        autoComplete="tel"
        value={telephone}
        onChangeText={setTelephone}
      />
      <Champ
        label="Mot de passe"
        placeholder="8 caractères minimum"
        motDePasse
        value={motDePasse}
        onChangeText={setMotDePasse}
      />
      <Champ
        label="Confirmer le mot de passe"
        placeholder="Retapez le mot de passe"
        motDePasse
        value={confirmation}
        onChangeText={setConfirmation}
        onSubmitEditing={valider}
      />

      {erreur && (
        <View style={[styles.erreur, { backgroundColor: `${c.danger}14` }]}>
          <Texte variant="captionStrong" color="danger" style={{ flex: 1 }}>
            {erreur}
          </Texte>
        </View>
      )}

      <Bouton titre="Créer mon compte" chargement={enCours} onPress={valider} />
      <SeparateurOu couleur={c.border} />
      <BoutonGoogle onErreur={setErreur} />

      <View style={styles.connexion}>
        <Texte variant="body" color="textMuted">
          Déjà inscrit ?
        </Texte>
        <Link href="/login">
          <Texte variant="bodyStrong" color="primary">
            Se connecter
          </Texte>
        </Link>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  rangee: { flexDirection: 'row', gap: Espace.md },
  erreur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Rayons.md,
    padding: 12,
  },
  connexion: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 },
});
