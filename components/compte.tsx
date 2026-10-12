import { Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icone, type NomIcone } from '@/components/ui/icone';
import { Texte } from '@/components/ui/texte';
import { Rayons, type CouleurSemantique } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Bloc de lignes séparées par un filet, avec un titre en capitales. */
export function Groupe({ titre, vide = 'Rien pour le moment', children }: { titre?: string; vide?: string; children: ReactNode }) {
  const { c } = useTheme();
  const lignes = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);

  return (
    <View style={styles.groupe}>
      {titre && (
        <Texte variant="label" color="textMuted" style={{ marginLeft: 4 }}>
          {titre}
        </Texte>
      )}
      <View style={[styles.cadre, { backgroundColor: c.surface, borderColor: c.border }]}>
        {lignes.length === 0 ? (
          <View style={styles.ligne}>
            <Texte variant="caption" color="textFaint">
              {vide}
            </Texte>
          </View>
        ) : (
          lignes.map((ligne, i) => (
            <Fragment key={i}>
              {i > 0 && <View style={[styles.filet, { backgroundColor: c.border }]} />}
              {ligne}
            </Fragment>
          ))
        )}
      </View>
    </View>
  );
}

/** Ligne d'un groupe : icône, titre, détail, élément à droite ; chevron si elle navigue. */
export function Ligne({
  titre,
  detail,
  icone,
  droite,
  onPress,
  chevron = !!onPress,
}: {
  titre: string;
  detail?: string;
  icone?: NomIcone;
  droite?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: c.surfaceAlt }]}>
      {icone && (
        <View style={[styles.icone, { backgroundColor: c.surfaceAlt }]}>
          <Icone name={icone} size={18} color="textMuted" />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Texte variant="bodyStrong" numberOfLines={1}>
          {titre}
        </Texte>
        {detail && (
          <Texte variant="caption" color="textMuted" numberOfLines={2}>
            {detail}
          </Texte>
        )}
      </View>
      {droite}
      {chevron && <Icone name="chevron-right" size={20} color="textFaint" />}
    </Pressable>
  );
}

/** Petite étiquette de statut colorée (payé, en attente, bloqué…). */
export function Etiquette({ libelle, couleur }: { libelle: string; couleur: CouleurSemantique }) {
  const { c } = useTheme();
  return (
    <View style={[styles.etiquette, { backgroundColor: `${c[couleur]}1F` }]}>
      <Texte variant="captionStrong" color={c[couleur]} style={{ fontSize: 12 }}>
        {libelle}
      </Texte>
    </View>
  );
}

/** Message d'erreur ou de confirmation sous un formulaire. */
export function Message({ texte, type = 'danger' }: { texte: string | null; type?: 'danger' | 'success' }) {
  const { c } = useTheme();
  if (!texte) return null;
  return (
    <View style={[styles.message, { backgroundColor: `${c[type]}14` }]}>
      <Icone name={type === 'danger' ? 'alert-circle-outline' : 'check-circle-outline'} size={18} color={type} />
      <Texte variant="captionStrong" color={type} style={{ flex: 1 }}>
        {texte}
      </Texte>
    </View>
  );
}

const styles = StyleSheet.create({
  groupe: { gap: 8 },
  cadre: { borderRadius: Rayons.lg, borderWidth: 1, overflow: 'hidden' },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  filet: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  icone: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  etiquette: { borderRadius: Rayons.pill, paddingHorizontal: 10, height: 24, justifyContent: 'center', alignSelf: 'flex-start' },
  message: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Rayons.md, padding: 12 },
});
