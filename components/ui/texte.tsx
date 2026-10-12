import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Polices, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const VARIANTES = {
  display: { fontFamily: Polices.displayHeavy, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  title: { fontFamily: Polices.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  heading: { fontFamily: Polices.display, fontSize: 19, lineHeight: 25, letterSpacing: -0.3 },
  subheading: { fontFamily: Polices.bodyBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: Polices.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: Polices.bodyBold, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: Polices.body, fontSize: 13, lineHeight: 18 },
  captionStrong: { fontFamily: Polices.bodyBold, fontSize: 13, lineHeight: 18 },
  label: {
    fontFamily: Polices.bodyBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  number: {
    fontFamily: Polices.display,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  numberLarge: {
    fontFamily: Polices.displayHeavy,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;

export type VarianteTexte = keyof typeof VARIANTES;

type Props = TextProps & {
  variant?: VarianteTexte;
  /** Clé de la palette (par défaut `text`) ou couleur littérale. */
  color?: keyof Palette | (string & {});
  align?: TextStyle['textAlign'];
};

export function Texte({ variant = 'body', color = 'text', align, style, ...rest }: Props) {
  const { c } = useTheme();
  const couleur = color in c ? c[color as keyof Palette] : color;

  return (
    <Text
      style={[VARIANTES[variant], styles.base, { color: couleur, textAlign: align }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: { includeFontPadding: false },
});
