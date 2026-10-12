import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReseauAnime } from '@/components/ui/reseau-anime';
import { SurfaceEncre } from '@/components/ui/surface-encre';
import { SymboleMarque } from '@/components/ui/symbole-marque';
import { Texte } from '@/components/ui/texte';
import { Espace, Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  titre: string;
  sousTitre: string;
  retour?: boolean;
  /** Scène animée affichée dans l'en-tête, à la place du réseau en fond. */
  illustration?: ReactNode;
  children: ReactNode;
};

/**
 * Mise en page des écrans d'authentification : marque et réseau animé sur fond nuit,
 * formulaire sur feuille (même signature visuelle que la connexion du site).
 */
export function AuthLayout({ titre, sousTitre, retour = false, illustration, children }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.ink }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bounces={false}>
        <SurfaceEncre style={{ ...styles.hero, paddingTop: insets.top + Espace.lg }}>
          {!illustration && (
            <View style={[styles.reseau, { top: insets.top - 40 }]}>
              <ReseauAnime taille={340} opacite={0.5} />
            </View>
          )}
          {retour ? (
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10} style={styles.retour}>
              <Texte variant="bodyStrong" color="onInkMuted">
                Retour
              </Texte>
            </Pressable>
          ) : (
            <Animated.View entering={FadeInDown.duration(500)} style={styles.marque}>
              <SymboleMarque taille={34} />
              <Texte variant="heading" color="onInk">
                Volteo
              </Texte>
            </Animated.View>
          )}
          <View style={styles.accroche}>
            <Animated.View entering={FadeInDown.duration(650).delay(120)}>
              <Texte variant="display" color="onInk">
                {titre}
              </Texte>
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(650).delay(240)}>
              <Texte variant="body" color="onInkMuted">
                {sousTitre}
              </Texte>
            </Animated.View>
          </View>
          {illustration && <Animated.View entering={FadeInDown.duration(650).delay(360)}>{illustration}</Animated.View>}
        </SurfaceEncre>

        <View
          style={[
            styles.feuille,
            { backgroundColor: c.background, paddingBottom: insets.bottom + Espace.xl },
          ]}>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: Espace.xl, paddingBottom: 56, gap: Espace.xxl },
  marque: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44 },
  reseau: { position: 'absolute', right: -40, width: 340, height: 340 },
  retour: { height: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  accroche: { gap: Espace.sm },
  feuille: {
    flexGrow: 1,
    marginTop: -Espace.xxl,
    borderTopLeftRadius: Rayons.xl,
    borderTopRightRadius: Rayons.xl,
    paddingHorizontal: Espace.xl,
    paddingTop: Espace.xxl,
    gap: Espace.lg,
  },
});
