import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Texte } from '@/components/ui/texte';
import { useAuth } from '@/contexts/auth-context';
import { informer } from '@/lib/dialogue';

WebBrowser.maybeCompleteAuthSession();

const IDS = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};
const ID_PLATEFORME = Platform.select({ ios: IDS.iosClientId, android: IDS.androidClientId, default: IDS.webClientId });

/** Logo « G » officiel de Google (couleurs imposées par la charte Google). */
function LogoGoogle() {
  return (
    <Svg width={26} height={26} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  );
}

function Apparence({ onPress, chargement, desactive }: { onPress: () => void; chargement?: boolean; desactive?: boolean }) {
  const echelle = useSharedValue(1);
  const anime = useAnimatedStyle(() => ({ transform: [{ scale: echelle.value }] }));
  return (
    <Animated.View style={[styles.centre, anime]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continuer avec Google"
        disabled={desactive || chargement}
        onPress={onPress}
        onPressIn={() => (echelle.value = withSpring(0.97, { damping: 15, stiffness: 400 }))}
        onPressOut={() => (echelle.value = withSpring(1, { damping: 10, stiffness: 300 }))}
        style={styles.bouton}>
        {chargement ? <ActivityIndicator color="#1F1F1F" /> : <LogoGoogle />}
      </Pressable>
    </Animated.View>
  );
}

/** Bouton actif : n'est monté que si l'identifiant client de la plateforme est configuré. */
function BoutonGoogleActif({ onErreur }: { onErreur: (m: string) => void }) {
  const { connexionGoogle } = useAuth();
  const [enCours, setEnCours] = useState(false);
  const [requete, reponse, ouvrir] = Google.useIdTokenAuthRequest({ ...IDS, selectAccount: true });

  useEffect(() => {
    if (reponse?.type !== 'success') {
      if (reponse && reponse.type !== 'dismiss' && reponse.type !== 'cancel') onErreur('La connexion Google a échoué. Réessayez.');
      setEnCours(false);
      return;
    }
    const idToken = reponse.params.id_token ?? reponse.authentication?.idToken;
    if (!idToken) {
      onErreur('Google n’a pas transmis votre identité. Réessayez.');
      setEnCours(false);
      return;
    }
    connexionGoogle(idToken)
      .catch((e) => onErreur(e instanceof Error ? e.message : 'Connexion Google impossible.'))
      .finally(() => setEnCours(false));
  }, [reponse, connexionGoogle, onErreur]);

  return (
    <Apparence
      desactive={!requete}
      chargement={enCours}
      onPress={() => {
        setEnCours(true);
        ouvrir().catch(() => setEnCours(false));
      }}
    />
  );
}

/** « Continuer avec Google » : connexion ou création de compte, avec la photo de profil Google. */
export function BoutonGoogle({ onErreur }: { onErreur: (m: string) => void }) {
  if (ID_PLATEFORME) return <BoutonGoogleActif onErreur={onErreur} />;
  return (
    <Apparence
      onPress={() =>
        informer(
          'Google bientôt disponible',
          'La connexion Google sera activée dès que l’identifiant client OAuth de l’application aura été configuré.',
          'google'
        )
      }
    />
  );
}

/** Séparateur « ou » entre les méthodes de connexion. */
export function SeparateurOu({ couleur }: { couleur: string }) {
  return (
    <View style={styles.separateur}>
      <View style={[styles.trait, { backgroundColor: couleur }]} />
      <Texte variant="label" color="textFaint">
        ou continuer avec
      </Texte>
      <View style={[styles.trait, { backgroundColor: couleur }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignSelf: 'center' },
  bouton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  separateur: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trait: { flex: 1, height: StyleSheet.hairlineWidth },
});
