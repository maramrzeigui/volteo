import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { Polices } from '@/constants/theme';
import { Bienvenue } from '@/components/guide/bienvenue';
import { SplashAnime, useSplashAnime } from '@/components/splash-anime';
import { HotePopups } from '@/components/ui/popup';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { GuideProvider, useGuide } from '@/contexts/guide-context';
import { useTheme } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const { utilisateur, chargement } = useAuth();
  const { c } = useTheme();

  if (chargement) return null;

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: c.background },
        headerTitleStyle: { fontFamily: Polices.display, color: c.text },
        headerTintColor: c.text,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.background },
      }}>
      <Stack.Protected guard={!!utilisateur}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="borne/[id]"
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen name="recharge" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="assistant" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="trajet" options={{ headerShown: false, animation: 'fade_from_bottom' }} />
        <Stack.Screen
          name="session/[id]"
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        {/* Espace « Compte » : en-tête natif avec retour vers l'onglet Compte. */}
        <Stack.Screen name="compte/vehicules" options={{ title: 'Mes véhicules', headerBackTitle: 'Compte' }} />
        <Stack.Screen name="compte/vehicule" options={{ title: 'Véhicule', headerBackTitle: 'Retour' }} />
        <Stack.Screen name="compte/batterie" options={{ title: 'Ma batterie', headerBackTitle: 'Compte' }} />
        <Stack.Screen name="compte/paiements" options={{ title: 'Paiements et factures', headerBackTitle: 'Compte' }} />
        <Stack.Screen name="compte/abonnement" options={{ title: 'Abonnement', headerBackTitle: 'Compte' }} />
        <Stack.Screen name="compte/securite" options={{ title: 'Profil et sécurité', headerBackTitle: 'Compte' }} />
        <Stack.Screen name="compte/qr" options={{ title: 'Mon QR code', headerBackTitle: 'Compte' }} />
      </Stack.Protected>
      <Stack.Protected guard={!utilisateur}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

function Chargeur() {
  const { chargement } = useAuth();
  const splash = useSplashAnime();
  const [policesPretes, erreurPolices] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });

  const pret = (policesPretes || !!erreurPolices) && !chargement;

  useEffect(() => {
    if (pret) SplashScreen.hideAsync().catch(() => undefined);
  }, [pret]);

  if (!pret) return null;
  return (
    <>
      <RootNavigator />
      {!splash.visible && <GuideBienvenue />}
      {splash.visible && <SplashAnime onFin={splash.terminer} />}
      <HotePopups />
    </>
  );
}

/** Écran de bienvenue animé au premier lancement (rejouable depuis le Compte). */
function GuideBienvenue() {
  const { bienvenueVue, terminerBienvenue } = useGuide();
  if (bienvenueVue !== false) return null;
  return <Bienvenue onTerminer={terminerBienvenue} />;
}

export default function RootLayout() {
  const { c, scheme } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: c.primary,
          background: c.background,
          card: c.surface,
          text: c.text,
          border: c.border,
        },
      }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <GuideProvider>
            <Chargeur />
          </GuideProvider>
        </AuthProvider>
        <StatusBar style="light" />
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
