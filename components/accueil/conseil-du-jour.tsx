import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Carte } from '@/components/ui/carte';
import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { useTheme } from '@/hooks/use-theme';

const CONSEILS: { icone: NomIcone; titre: string; texte: string }[] = [
  {
    icone: 'battery-charging-80',
    titre: 'Visez 80 %',
    texte: 'Au-delà de 80 %, la recharge ralentit fortement : arrêtez-vous là pour gagner du temps.',
  },
  {
    icone: 'thermometer',
    titre: 'Batterie tiède',
    texte: 'Une batterie à bonne température accepte plus de puissance : rechargez juste après avoir roulé.',
  },
  { icone: 'calendar-clock', titre: 'Réservez', texte: 'Réservez une prise avant de partir : elle vous attend 15 minutes.' },
  { icone: 'speedometer-slow', titre: 'Éco-conduite', texte: 'À 110 km/h au lieu de 130, vous gagnez près de 20 % d’autonomie.' },
  {
    icone: 'robot-happy-outline',
    titre: 'Demandez à Volta',
    texte: 'L’assistant estime le prix et la durée d’une recharge en une question.',
  },
];

/** Carte « Conseil » qui change toutes les 7 secondes, en fondu. */
export function ConseilDuJour() {
  const { c } = useTheme();
  const [i, setI] = useState(() => new Date().getDate() % CONSEILS.length);

  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % CONSEILS.length), 7000);
    return () => clearInterval(t);
  }, []);

  const conseil = CONSEILS[i];
  return (
    <Carte style={styles.carte}>
      <Animated.View key={i} entering={FadeIn.duration(450)} exiting={FadeOut.duration(250)} style={styles.ligne}>
        <View style={[styles.icone, { backgroundColor: c.primarySoft }]}>
          <Icone name={conseil.icone} size={22} color="primary" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Texte variant="label" color="primary">
            Conseil · {conseil.titre}
          </Texte>
          <Texte variant="caption" color="textMuted">
            {conseil.texte}
          </Texte>
        </View>
      </Animated.View>
      <View style={styles.points}>
        {CONSEILS.map((_, j) => (
          <View key={j} style={[styles.point, { backgroundColor: j === i ? c.primary : c.border, width: j === i ? 14 : 5 }]} />
        ))}
      </View>
    </Carte>
  );
}

const styles = StyleSheet.create({
  carte: { gap: 12 },
  ligne: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 54 },
  icone: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  points: { flexDirection: 'row', gap: 4, alignSelf: 'center' },
  point: { height: 5, borderRadius: 3 },
});
