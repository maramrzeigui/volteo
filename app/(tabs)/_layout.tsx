import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { BoutonAssistant } from '@/components/assistant/bouton-assistant';
import { BarreOnglets } from '@/components/barre-onglets';
import { VisiteGuidee } from '@/components/guide/visite-guidee';
import { useGuide } from '@/contexts/guide-context';
import { useTheme } from '@/hooks/use-theme';

export default function TabLayout() {
  const { c } = useTheme();
  const { bienvenueVue, visiteVue, terminerVisite, zonesOnglets } = useGuide();
  // La visite démarre une fois l'écran de bienvenue passé et la barre d'onglets mesurée.
  const visite = bienvenueVue === true && visiteVue === false && zonesOnglets.length === 5;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <BarreOnglets {...props} />}
        screenOptions={{ headerShown: false, animation: 'fade', sceneStyle: { backgroundColor: c.background } }}>
        <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
        <Tabs.Screen name="carte" options={{ title: 'Carte' }} />
        <Tabs.Screen name="bornes" options={{ title: 'Bornes' }} />
        <Tabs.Screen name="sessions" options={{ title: 'Activité' }} />
        <Tabs.Screen name="profil" options={{ title: 'Compte' }} />
      </Tabs>
      {!visite && bienvenueVue === true && <BoutonAssistant />}
      {visite && <VisiteGuidee zones={zonesOnglets} onTerminer={terminerVisite} />}
    </View>
  );
}
