import { useEffect, useRef, useState } from 'react';

import { Texte, type VarianteTexte } from '@/components/ui/texte';
import type { Palette } from '@/constants/theme';
import { formatNombre } from '@/lib/format';

type Props = {
  valeur: number | null | undefined;
  decimales?: number;
  duree?: number;
  variant?: VarianteTexte;
  color?: keyof Palette | (string & {});
  suffixe?: string;
  /** Unité affichée en petit à côté du nombre (kWh, DT, km). */
  unite?: string;
  couleurUnite?: keyof Palette | (string & {});
};

/** Nombre qui défile jusqu'à sa valeur (easing cubique), puis suit ses mises à jour. */
export function ChiffreAnime({
  valeur,
  decimales = 0,
  duree = 900,
  variant = 'number',
  color,
  suffixe,
  unite,
  couleurUnite = 'textMuted',
}: Props) {
  const [affiche, setAffiche] = useState(0);
  const depart = useRef(0);

  useEffect(() => {
    if (valeur == null) return;
    const de = depart.current;
    const debut = Date.now();
    let frame: number;

    const tick = () => {
      const t = Math.min(1, (Date.now() - debut) / duree);
      const e = 1 - Math.pow(1 - t, 3);
      const courant = de + (valeur - de) * e;
      setAffiche(courant);
      depart.current = courant;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [valeur, duree]);

  return (
    <Texte variant={variant} color={color} style={{ fontVariant: ['tabular-nums'] }}>
      {valeur == null ? '—' : formatNombre(affiche, decimales)}
      {suffixe}
      {unite && (
        <Texte variant="captionStrong" color={couleurUnite}>
          {' '}
          {unite}
        </Texte>
      )}
    </Texte>
  );
}
