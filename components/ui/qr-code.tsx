import { create } from 'qrcode';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

type Props = {
  valeur: string;
  taille?: number;
  couleur?: string;
  fond?: string;
};

/** QR code vectoriel (react-native-svg), lisible par l'appareil photo et les bornes. */
export function QrCode({ valeur, taille = 220, couleur = '#0D0D10', fond = '#FFFFFF' }: Props) {
  const { trace, cote } = useMemo(() => {
    const { modules } = create(valeur, { errorCorrectionLevel: 'M' });
    const marge = 2;
    let d = '';
    for (let ligne = 0; ligne < modules.size; ligne++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(ligne, col)) d += `M${col + marge} ${ligne + marge}h1v1h-1z`;
      }
    }
    return { trace: d, cote: modules.size + marge * 2 };
  }, [valeur]);

  return (
    <Svg width={taille} height={taille} viewBox={`0 0 ${cote} ${cote}`} accessibilityLabel="QR code">
      <Rect x={0} y={0} width={cote} height={cote} fill={fond} />
      <Path d={trace} fill={couleur} />
    </Svg>
  );
}
