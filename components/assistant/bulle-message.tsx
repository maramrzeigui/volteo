import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';

import { CarteResultat } from '@/components/assistant/carte-assistant';
import { TexteRiche } from '@/components/assistant/texte-riche';
import { Icone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MessageAssistant } from '@/types/domain';

/** Cartes affichées d'emblée sous une réponse ; les suivantes sur demande. */
const CARTES_VISIBLES = 3;

/** Message du fil : bulle rouge pour le client, bulle sombre et cartes pour l'assistant. */
export function BulleMessage({ message }: { message: MessageAssistant }) {
  const { c } = useTheme();
  const client = message.role === 'utilisateur';
  const [toutes, setToutes] = useState(false);

  if (client) {
    return (
      <Animated.View entering={FadeInRight.duration(260)} style={[styles.bulle, styles.client, { backgroundColor: c.action }]}>
        <TexteRiche texte={message.contenu} couleur="onPrimary" />
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(380)} style={styles.reponse}>
      <View
        style={[
          styles.bulle,
          styles.assistant,
          message.erreur
            ? { backgroundColor: '#2A181B', borderColor: '#FF6B6B66' }
            : { backgroundColor: c.surface, borderColor: c.border },
        ]}>
        <TexteRiche texte={message.contenu} couleur={message.erreur ? 'danger' : 'text'} />
      </View>
      {(toutes ? message.cartes : message.cartes.slice(0, CARTES_VISIBLES)).map((carte, i) => (
        <CarteResultat key={`${carte.type}-${i}`} carte={carte} rang={i} />
      ))}
      {!toutes && message.cartes.length > CARTES_VISIBLES && (
        <Pressable accessibilityRole="button" onPress={() => setToutes(true)} style={styles.plus} hitSlop={6}>
          <Texte variant="captionStrong" color="primary">
            Voir {message.cartes.length - CARTES_VISIBLES} autre{message.cartes.length - CARTES_VISIBLES > 1 ? 's' : ''}
          </Texte>
          <Icone name="chevron-down" size={18} color="primary" />
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bulle: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: Rayons.lg, maxWidth: '88%' },
  client: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  assistant: { alignSelf: 'flex-start', borderWidth: 1, borderBottomLeftRadius: 6 },
  reponse: { gap: 8 },
  plus: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 4 },
});
