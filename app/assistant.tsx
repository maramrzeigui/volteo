import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarIA } from '@/components/assistant/avatar-ia';
import { BulleMessage } from '@/components/assistant/bulle-message';
import { IndicateurFrappe } from '@/components/assistant/indicateur-frappe';
import { RobotAnime } from '@/components/assistant/robot-anime';
import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Espace, Polices, Rayons } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { confirmer } from '@/lib/dialogue';
import { capitaliser } from '@/lib/format';
import type { ConversationResume, EtatAssistant, MessageAssistant } from '@/types/domain';

const NOM_ASSISTANT = 'Volta';

/** Premières questions proposées, avec leur icône. */
const SUGGESTIONS_ACCUEIL: { icone: NomIcone; texte: string }[] = [
  { icone: 'ev-station', texte: 'Quelles bornes sont libres maintenant ?' },
  { icone: 'calculator-variant-outline', texte: 'Combien coûte une recharge de 20 à 80 % ?' },
  { icone: 'wallet-outline', texte: 'Mon solde et mon abonnement' },
  { icone: 'timer-sand', texte: 'Comment fonctionne la réservation ?' },
  { icone: 'lightning-bolt', texte: 'وين نلقى بورن شحن سريع؟' },
];

export default function AssistantScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { utilisateur } = useAuth();
  const params = useLocalSearchParams<{ question?: string }>();

  const [messages, setMessages] = useState<MessageAssistant[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [titre, setTitre] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [etat, setEtat] = useState<EtatAssistant | null>(null);
  const [historique, setHistorique] = useState<ConversationResume[] | null>(null);
  const defilement = useRef<ScrollView>(null);
  const questionInitiale = useRef(params.question ?? null);

  useEffect(() => {
    api.etatAssistant().then(setEtat).catch(() => undefined);
  }, []);

  const descendre = () => requestAnimationFrame(() => defilement.current?.scrollToEnd({ animated: true }));
  // Nouvelle réponse : on montre son début (le texte), pas le bas des cartes.
  const positions = useRef(new Map<MessageAssistant['id'], number>());
  const aCadrer = useRef<MessageAssistant['id'] | null>(null);
  const placer = (id: MessageAssistant['id'], y: number) => {
    positions.current.set(id, y);
    if (aCadrer.current === id) {
      aCadrer.current = null;
      requestAnimationFrame(() => defilement.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }));
    }
  };

  const envoyer = useCallback(
    async (texte?: string) => {
      const question = (texte ?? saisie).trim();
      if (!question || envoi) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      setSaisie('');
      setMessages((m) => [...m, { id: `q-${Date.now()}`, role: 'utilisateur', contenu: question, cartes: [], suggestions: [], erreur: false }]);
      setEnvoi(true);
      descendre();

      try {
        const r = await api.poserQuestion(question, conversationId);
        setConversationId(r.conversationId);
        setTitre(r.titre);
        aCadrer.current = r.message.id;
        setMessages((m) => [...m, r.message]);
        setEtat((e) => (e ? { ...e, questionsRestantes: r.questionsRestantes } : e));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } catch (e) {
        const quota = e instanceof api.ErreurAssistant && e.statut === 429;
        setMessages((m) => [
          ...m,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            contenu: e instanceof Error ? e.message : 'L’assistant ne répond pas pour le moment.',
            cartes: [],
            suggestions: quota ? ['Voir les abonnements'] : [],
            erreur: true,
          },
        ]);
        if (quota) setEtat((s) => (s ? { ...s, questionsRestantes: 0 } : s));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      } finally {
        setEnvoi(false);
        if (!aCadrer.current) descendre();
      }
    },
    [saisie, envoi, conversationId],
  );

  // Question transmise par un autre écran (ex. « Demander à Volta » sur une fiche borne).
  useEffect(() => {
    if (questionInitiale.current) {
      const q = questionInitiale.current;
      questionInitiale.current = null;
      envoyer(q);
    }
  }, [envoyer]);

  const nouvelle = () => {
    if (envoi) return;
    setMessages([]);
    setConversationId(null);
    setTitre(null);
  };

  const ouvrirHistorique = async () => {
    setHistorique([]);
    setHistorique(await api.conversationsAssistant().catch(() => []));
  };

  const ouvrirConversation = async (id: string) => {
    setHistorique(null);
    const conv = await api.conversationAssistant(id).catch(() => null);
    if (!conv) return;
    setConversationId(conv.id);
    setTitre(conv.titre);
    setMessages(conv.messages);
    descendre();
  };

  const supprimer = async (conv: ConversationResume) => {
    const ok = await confirmer('Supprimer cette conversation ?', conv.titre ?? '', { confirmer: 'Supprimer', annuler: 'Garder', destructif: true });
    if (!ok) return;
    await api.supprimerConversation(conv.id).catch(() => undefined);
    setHistorique((h) => (h ?? []).filter((x) => x.id !== conv.id));
    if (conv.id === conversationId) nouvelle();
  };

  const choisirSuggestion = (s: string) => {
    if (s === 'Voir les abonnements') {
      router.push('/compte/abonnement');
      return;
    }
    envoyer(s);
  };

  const dernier = messages.at(-1);
  const suggestions = dernier?.role === 'assistant' ? dernier.suggestions : [];
  const quotaVisible = etat?.questionsRestantes != null;
  const bloque = etat?.questionsRestantes === 0 || etat?.disponible === false;

  return (
    <KeyboardAvoidingView
      style={[styles.ecran, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* En-tête */}
      <View style={[styles.entete, { paddingTop: insets.top + Espace.sm, borderBottomColor: c.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer l’assistant" hitSlop={10} onPress={() => router.back()}>
          <Icone name="chevron-down" size={28} color="textMuted" />
        </Pressable>
        <AvatarIA reflechit={envoi} />
        <View style={{ flex: 1 }}>
          <Texte variant="subheading" numberOfLines={1}>
            {titre ?? `${NOM_ASSISTANT}, votre assistant`}
          </Texte>
          <Texte variant="caption" color={envoi ? 'primary' : etat?.disponible === false ? 'textFaint' : 'success'}>
            {envoi ? 'En train d’écrire…' : etat?.disponible === false ? 'Indisponible' : 'En ligne'}
          </Texte>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Nouvelle conversation" hitSlop={8} onPress={nouvelle} disabled={envoi}>
          <Icone name="plus-circle-outline" size={24} color="primary" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Historique des conversations" hitSlop={8} onPress={ouvrirHistorique} disabled={envoi}>
          <Icone name="history" size={24} color="text" />
        </Pressable>
      </View>

      {/* Fil */}
      <ScrollView
        ref={defilement}
        contentContainerStyle={[styles.fil, messages.length === 0 && styles.filVide]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => messages.length > 0 && !aCadrer.current && envoi && descendre()}>
        {messages.length === 0 ? (
          <Animated.View entering={FadeIn.duration(500)} style={styles.accueil}>
            <Texte variant="title" align="center">
              Bonjour {capitaliser(utilisateur?.prenom) || ''} 👋
            </Texte>
            <Texte variant="body" color="textMuted" align="center">
              Je suis {NOM_ASSISTANT}. Bornes, tarifs, recharges, compte : comment puis-je vous aider ?
            </Texte>
            <View style={styles.robot}>
              <View style={[styles.halo, { backgroundColor: '#E5545F1A' }]} />
              <RobotAnime taille={190} />
            </View>
            <View style={styles.grille}>
              {SUGGESTIONS_ACCUEIL.map((s, i) => (
                <Animated.View key={s.texte} entering={FadeInDown.delay(200 + i * 70).duration(400)}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={bloque}
                    onPress={() => envoyer(s.texte)}
                    style={({ pressed }) => [
                      styles.suggestion,
                      { backgroundColor: c.surface, borderColor: c.border, opacity: bloque ? 0.5 : pressed ? 0.8 : 1 },
                    ]}>
                    <Icone name={s.icone} size={18} color="primary" />
                    <Texte variant="captionStrong" style={{ flex: 1 }}>
                      {s.texte}
                    </Texte>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        ) : (
          messages.map((m) => (
            <View key={m.id} onLayout={(e) => placer(m.id, e.nativeEvent.layout.y)}>
              <BulleMessage message={m} />
            </View>
          ))
        )}
        {envoi && <IndicateurFrappe />}
      </ScrollView>

      {/* Saisie */}
      <View style={[styles.pied, { borderTopColor: c.border, backgroundColor: c.background, paddingBottom: insets.bottom + Espace.sm }]}>
        {suggestions.length > 0 && !envoi && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.puces} keyboardShouldPersistTaps="handled">
            {suggestions.map((s) => (
              <Pressable
                key={s}
                accessibilityRole="button"
                onPress={() => choisirSuggestion(s)}
                style={({ pressed }) => [styles.puce, { borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 }]}>
                <Icone name="creation" size={14} color="primary" />
                <Texte variant="captionStrong">{s}</Texte>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {quotaVisible && (
          <View style={styles.quota}>
            <Icone name="lightning-bolt" size={13} color="warning" />
            <Texte variant="caption" color="warning">
              {etat!.questionsRestantes === 0
                ? 'Questions gratuites épuisées aujourd’hui · illimité avec un abonnement'
                : `${etat!.questionsRestantes} question${etat!.questionsRestantes! > 1 ? 's' : ''} gratuite${etat!.questionsRestantes! > 1 ? 's' : ''} aujourd’hui`}
            </Texte>
          </View>
        )}
        <View style={styles.saisie}>
          <TextInput
            value={saisie}
            onChangeText={setSaisie}
            placeholder={bloque ? 'Assistant indisponible pour le moment' : `Posez votre question à ${NOM_ASSISTANT}…`}
            placeholderTextColor={c.textFaint}
            multiline
            maxLength={1000}
            editable={!bloque}
            onSubmitEditing={() => envoyer()}
            submitBehavior="submit"
            returnKeyType="send"
            style={[styles.champ, { color: c.text, backgroundColor: c.surface, borderColor: c.border, fontFamily: Polices.body }]}
          />
          <BoutonEnvoi actif={!!saisie.trim() && !envoi && !bloque} onPress={() => envoyer()} />
        </View>
      </View>

      {/* Historique */}
      <Modal visible={historique !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setHistorique(null)}>
        <View style={[styles.historique, { backgroundColor: c.background }]}>
          <View style={styles.enteteHistorique}>
            <Texte variant="heading">Conversations</Texte>
            <Pressable accessibilityRole="button" onPress={() => setHistorique(null)} hitSlop={10}>
              <Texte variant="bodyStrong" color="primary">
                Fermer
              </Texte>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: Espace.sm, paddingBottom: Espace.xxxl }}>
            {historique?.length === 0 && (
              <Texte variant="body" color="textMuted" align="center" style={{ marginTop: Espace.xl }}>
                Aucune conversation pour l’instant.
              </Texte>
            )}
            {historique?.map((conv) => (
              <Pressable
                key={conv.id}
                accessibilityRole="button"
                onPress={() => ouvrirConversation(conv.id)}
                style={({ pressed }) => [styles.conversation, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
                <Icone name="message-text-outline" size={20} color="primary" />
                <View style={{ flex: 1 }}>
                  <Texte variant="bodyStrong" numberOfLines={1}>
                    {conv.titre ?? 'Conversation'}
                  </Texte>
                  <Texte variant="caption" color="textMuted">
                    {conv.messages} messages
                  </Texte>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Supprimer" hitSlop={10} onPress={() => supprimer(conv)}>
                  <Icone name="trash-can-outline" size={20} color="textFaint" />
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/** Bouton d'envoi qui « s'allume » quand une question est prête. */
function BoutonEnvoi({ actif, onPress }: { actif: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const echelle = useSharedValue(1);
  useEffect(() => {
    echelle.value = withSpring(actif ? 1 : 0.9, { damping: 12, stiffness: 260 });
  }, [actif, echelle]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: echelle.value }] }));

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Envoyer"
        disabled={!actif}
        onPress={onPress}
        style={[styles.envoi, { backgroundColor: actif ? c.action : c.surfaceAlt }]}>
        <Icone name="send" size={20} color={actif ? '#FFFFFF' : 'textFaint'} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1 },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espace.md,
    paddingHorizontal: Espace.lg,
    paddingBottom: Espace.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fil: { padding: Espace.lg, gap: Espace.md },
  filVide: { flexGrow: 1, justifyContent: 'center' },
  accueil: { alignItems: 'center', gap: Espace.sm },
  robot: { alignItems: 'center', justifyContent: 'center', marginVertical: Espace.sm },
  halo: { position: 'absolute', width: 210, height: 210, borderRadius: 105 },
  grille: { alignSelf: 'stretch', gap: Espace.sm },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espace.md,
    paddingHorizontal: Espace.lg,
    paddingVertical: 14,
    borderRadius: Rayons.lg,
    borderWidth: 1,
  },
  pied: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Espace.sm, gap: Espace.sm },
  puces: { gap: Espace.sm, paddingHorizontal: Espace.lg },
  puce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Rayons.pill,
    borderWidth: 1,
  },
  quota: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  saisie: { flexDirection: 'row', alignItems: 'flex-end', gap: Espace.sm, paddingHorizontal: Espace.lg },
  champ: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 23,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 13,
    paddingBottom: 13,
    fontSize: 15,
  },
  envoi: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  historique: { flex: 1, padding: Espace.lg, gap: Espace.lg },
  enteteHistorique: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Espace.sm },
  conversation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espace.md,
    padding: Espace.lg,
    borderRadius: Rayons.lg,
    borderWidth: 1,
  },
});
