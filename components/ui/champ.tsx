import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Texte } from '@/components/ui/texte';
import { Polices, Rayons } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = TextInputProps & {
  /** Sans libellé visible, il sert d’étiquette d’accessibilité. */
  label: string;
  masquerLabel?: boolean;
  motDePasse?: boolean;
};

export function Champ({ label, masquerLabel = false, motDePasse = false, style, ...rest }: Props) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.bloc}>
      {!masquerLabel && (
        <Texte variant="captionStrong" color="textMuted">
          {label}
        </Texte>
      )}
      <View
        style={[
          styles.cadre,
          {
            backgroundColor: c.surface,
            borderColor: focus ? c.primary : c.border,
            shadowColor: c.primary,
            shadowOpacity: focus ? 0.18 : 0,
          },
        ]}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={c.textFaint}
          secureTextEntry={motDePasse && !visible}
          onFocus={(e) => {
            setFocus(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            rest.onBlur?.(e);
          }}
          style={[styles.saisie, { color: c.text }, style]}
          {...rest}
        />
        {motDePasse && (
          <Pressable
            hitSlop={10}
            accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            onPress={() => setVisible((v) => !v)}>
            <Texte variant="captionStrong" color="primary">
              {visible ? 'Masquer' : 'Afficher'}
            </Texte>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: 8 },
  cadre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: Rayons.md,
    paddingHorizontal: 14,
    minHeight: 54,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
  },
  saisie: {
    flex: 1,
    fontFamily: Polices.bodySemi,
    fontSize: 16,
    paddingVertical: 14,
    // Le cadre porte déjà l'état focus ; évite le contour bleu du navigateur.
    outlineWidth: 0,
  },
});
