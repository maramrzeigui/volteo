import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BoutonGoogle, SeparateurOu } from '@/components/auth/bouton-google';
import { AuthLayout } from '@/components/auth-layout';
import { ArretRecharge } from '@/components/illustrations/arret-recharge';
import { Bouton } from '@/components/ui/bouton';
import { Champ } from '@/components/ui/champ';
import { Texte } from '@/components/ui/texte';
import { Rayons } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const { c } = useTheme();
  const { connexion, verifier2fa } = useAuth();

  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [code2fa, setCode2fa] = useState('');
  const [attente2fa, setAttente2fa] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const valider = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      if (attente2fa) {
        await verifier2fa(email.trim(), code2fa.trim());
      } else {
        const requiert2fa = await connexion(email.trim(), motDePasse);
        if (requiert2fa) setAttente2fa(true);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Connexion impossible');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <AuthLayout
      illustration={attente2fa ? undefined : <ArretRecharge />}
      titre={attente2fa ? 'Vérification' : 'Rechargez partout en Tunisie'}
      sousTitre={
        attente2fa
          ? `Saisissez le code à 6 chiffres envoyé à ${email.trim()}.`
          : 'Trouvez une borne, lancez la charge et payez depuis votre téléphone.'
      }>
      {attente2fa ? (
        <Champ
          label="Code de vérification"
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          value={code2fa}
          onChangeText={setCode2fa}
          onSubmitEditing={valider}
        />
      ) : (
        <>
          <Champ
            label="Email"
            placeholder="vous@exemple.tn"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
          />
          <Champ
            label="Mot de passe"
            placeholder="Votre mot de passe"
            motDePasse
            autoComplete="password"
            value={motDePasse}
            onChangeText={setMotDePasse}
            onSubmitEditing={valider}
            returnKeyType="go"
          />
          <Link href="/mot-de-passe-oublie" style={styles.oubli}>
            <Texte variant="captionStrong" color="primary">
              Mot de passe oublié ?
            </Texte>
          </Link>
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
        titre={attente2fa ? 'Vérifier le code' : 'Se connecter'}
        chargement={enCours}
        onPress={valider}
      />

      {!attente2fa && (
        <>
          <SeparateurOu couleur={c.border} />
          <BoutonGoogle onErreur={setErreur} />
        </>
      )}

      {attente2fa ? (
        <Bouton titre="Changer de compte" variante="fantome" onPress={() => setAttente2fa(false)} />
      ) : (
        <View style={styles.inscription}>
          <Texte variant="body" color="textMuted">
            Nouveau sur Volteo ?
          </Texte>
          <Link href="/register">
            <Texte variant="bodyStrong" color="primary">
              Créer un compte
            </Texte>
          </Link>
        </View>
      )}

    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  oubli: { alignSelf: 'flex-end', marginTop: -4 },
  erreur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Rayons.md,
    padding: 12,
  },
  inscription: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 },
});
