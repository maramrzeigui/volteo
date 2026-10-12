import { theme, type ThemeConfig } from 'antd'

/**
 * Système visuel Volteo — thème sombre anthracite et rouge carmin, partagé avec l'app mobile
 * (constants/theme.ts).
 * - « rouge » : couleur d'action (boutons à texte blanc, 5,5:1).
 * - « rougeVif » : rouge pour le texte et les icônes sur fond sombre (5:1).
 * - « cuivre » : montants et chiffre d'affaires.
 * Les couleurs sémantiques (succès / alerte / danger / info) ne servent qu'aux états.
 */
export const C = {
  fond: '#111113',
  surface: '#1A1A1D',
  surfaceAlt: '#232327',
  surfaceHaute: '#2A2A31',
  bordure: '#2D2D32',
  texte: '#F5F5F7',
  texteDoux: '#A1A1AA',
  texteDiscret: '#8E8E99',

  rouge: '#B83A46',
  rougeSurvol: '#CC4652',
  rougeFonce: '#9E2F3A',
  rougeVif: '#E5545F',
  rougeDoux: 'rgba(229, 84, 95, 0.12)',

  /** Fonds de navigation et bandeaux : noir profond. */
  encre: '#0D0D10',
  encreRelevee: '#1E1E24',
  encreProfonde: '#08080A',
  surEncre: '#F5F5F7',
  surEncreDoux: '#A1A1AA',

  // Montants : rose poudré (même palette que l'application mobile, sans orange).
  cuivre: '#F4CDC6',

  // États : une seule famille rouge + neutres (ni vert, ni bleu, ni orange), comme sur mobile.
  succes: '#F2A3AA',
  alerte: '#D9D9E0',
  danger: '#FF5A6E',
  info: '#E5545F',
  violet: '#8E8E99',
  turquoise: '#B83A46',
} as const

/** Séries des graphiques, dans l'ordre d'usage (lisibles sur fond sombre et distinctes entre elles). */
export const SERIES = [C.rougeVif, C.succes, C.cuivre, C.violet, C.alerte, C.turquoise]

export const POLICES = {
  titre: "'Outfit Variable', 'Outfit', system-ui, sans-serif",
  texte: "'DM Sans Variable', 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace",
}

export const themeAntd: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: C.rouge,
    colorInfo: C.info,
    colorSuccess: C.succes,
    colorWarning: C.alerte,
    colorError: C.danger,
    colorLink: C.rougeVif,
    colorLinkHover: '#FF6B7D',
    colorText: C.texte,
    colorTextSecondary: C.texteDoux,
    colorTextTertiary: C.texteDiscret,
    colorBgBase: C.fond,
    colorBgLayout: C.fond,
    colorBgContainer: C.surface,
    colorBgElevated: C.surfaceAlt,
    colorBorder: C.bordure,
    colorBorderSecondary: '#26262D',
    colorFillAlter: '#202026',
    borderRadius: 12,
    borderRadiusLG: 18,
    borderRadiusSM: 8,
    controlHeight: 38,
    controlHeightLG: 48,
    fontFamily: POLICES.texte,
    fontFamilyCode: POLICES.mono,
    fontSize: 14,
    motionDurationMid: '0.2s',
  },
  components: {
    Layout: { siderBg: C.encre, headerBg: 'transparent', bodyBg: C.fond, headerHeight: 72 },
    Menu: {
      darkItemBg: C.encre,
      darkSubMenuItemBg: C.encre,
      darkItemColor: C.texteDoux,
      darkItemHoverColor: C.texte,
      darkItemHoverBg: 'rgba(255, 255, 255, 0.04)',
      darkItemSelectedBg: C.rougeDoux,
      darkItemSelectedColor: '#FF5A6E',
      darkGroupTitleColor: '#6B6B76',
      itemBorderRadius: 12,
      itemHeight: 42,
      itemMarginInline: 10,
      iconSize: 16,
      horizontalItemSelectedColor: C.rougeVif,
      itemSelectedColor: C.rougeVif,
    },
    Card: { headerFontSize: 15, headerHeightSM: 50, paddingLG: 22 },
    Table: {
      headerBg: '#202026',
      headerColor: C.texteDoux,
      headerSplitColor: 'transparent',
      rowHoverBg: '#24242A',
      cellPaddingBlock: 13,
    },
    Button: {
      primaryShadow: '0 10px 28px -10px rgba(208, 20, 44, 0.75)',
      fontWeight: 600,
      defaultBg: 'transparent',
      defaultBorderColor: '#3A3A43',
    },
    Segmented: { itemSelectedBg: C.surfaceHaute, trackBg: C.fond },
    Tag: { defaultBg: C.surfaceAlt },
    Statistic: { contentFontSize: 26 },
    Tabs: { inkBarColor: C.rouge, itemSelectedColor: C.texte, itemActiveColor: C.rougeVif, itemHoverColor: C.texte },
  },
}
