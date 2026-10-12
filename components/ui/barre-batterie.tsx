import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Texte } from '@/components/ui/texte';

type Props = {
  pourcentage: number;
  /** Repère vertical de l'objectif de charge (ex. 80 %). */
  cible?: number;
  couleur: string;
  couleurPiste: string;
  couleurTexte?: string;
  hauteur?: number;
};

/** Niveau de batterie horizontal, rempli avec une animation, repère de cible facultatif. */
export function BarreBatterie({
  pourcentage,
  cible,
  couleur,
  couleurPiste,
  couleurTexte,
  hauteur = 10,
}: Props) {
  const niveau = useSharedValue(0);

  useEffect(() => {
    niveau.value = withTiming(Math.max(0, Math.min(100, pourcentage)), {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [pourcentage, niveau]);

  const remplissage = useAnimatedStyle(() => ({ width: `${niveau.value}%` }));

  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.piste, { height: hauteur, borderRadius: hauteur / 2, backgroundColor: couleurPiste }]}>
        <Animated.View style={[{ height: hauteur, borderRadius: hauteur / 2, backgroundColor: couleur }, remplissage]} />
        {cible != null && (
          <View style={[styles.repere, { left: `${cible}%`, backgroundColor: couleurTexte ?? couleur }]} />
        )}
      </View>
      {cible != null && (
        <View style={styles.legende}>
          <Texte variant="caption" color={couleurTexte} style={{ left: `${cible}%`, position: 'absolute', transform: [{ translateX: -20 }] }}>
            cible {cible} %
          </Texte>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  piste: { width: '100%', overflow: 'visible' },
  repere: { position: 'absolute', top: -4, bottom: -4, width: 2, borderRadius: 1, opacity: 0.8 },
  legende: { height: 16 },
});
