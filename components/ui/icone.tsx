import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import type { Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TypeConnecteur } from '@/types/domain';

export type NomIcone = ComponentProps<typeof MaterialCommunityIcons>['name'];

type Props = {
  name: NomIcone;
  size?: number;
  color?: keyof Palette | (string & {});
};

export function Icone({ name, size = 22, color = 'text' }: Props) {
  const { c } = useTheme();
  const couleur = color in c ? c[color as keyof Palette] : color;
  return <MaterialCommunityIcons name={name} size={size} color={couleur} />;
}

export const ICONE_CONNECTEUR: Record<TypeConnecteur, NomIcone> = {
  CCS: 'ev-plug-ccs2',
  Type2: 'ev-plug-type2',
  CHAdeMO: 'ev-plug-chademo',
  AC: 'power-plug',
  DC: 'flash',
};
