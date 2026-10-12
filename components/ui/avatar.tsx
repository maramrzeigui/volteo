import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import type { Utilisateur } from '@/types/domain';

/**
 * Avatar du client : photo Google si disponible, sinon initiales, dans un anneau
 * dégradé de la marque. Un petit badge « G » signale un compte relié à Google.
 */
export function Avatar({ utilisateur, taille = 44 }: { utilisateur: Utilisateur | null; taille?: number }) {
  const [erreurImage, setErreurImage] = useState(false);
  const initiales = `${utilisateur?.prenom?.[0] ?? ''}${utilisateur?.nom?.[0] ?? ''}`.toUpperCase();
  const photo = !erreurImage ? utilisateur?.photoUrl : null;
  const interieur = taille - 5;

  return (
    <View style={{ width: taille, height: taille }}>
      <LinearGradient colors={['#F2A3AA', '#E5545F', '#9E2F3A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.anneau, { borderRadius: taille / 2 }]}>
        <View style={[styles.interieur, { width: interieur, height: interieur, borderRadius: interieur / 2 }]}>
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={{ width: interieur, height: interieur }}
              contentFit="cover"
              transition={250}
              accessibilityIgnoresInvertColors
              onError={() => setErreurImage(true)}
            />
          ) : (
            <Texte variant={taille >= 56 ? 'heading' : 'captionStrong'} color="electric">
              {initiales}
            </Texte>
          )}
        </View>
      </LinearGradient>
      {utilisateur?.compteGoogle && taille >= 56 && (
        <View style={styles.badge}>
          <Icone name="google" size={11} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  anneau: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  interieur: { backgroundColor: '#0D0D10', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#B83A46',
    borderWidth: 2,
    borderColor: '#121215',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
