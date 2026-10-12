import { View } from 'react-native';
import Svg, { Defs, FeGaussianBlur, Filter, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/** Tracés du logo Volteo (repère 96) : un V dont le creux est traversé par un éclair. */
export const LOGO = {
  v: 'M22 24h15l11 30 11-30h15L54 74H42z',
  eclair: 'M52 20 40 46h9l-4 18 14-26h-9l4-18z',
};

/** Dégradé et halo lumineux de l'éclair (identifiants préfixés pour éviter les collisions). */
function DefsEclair({ id }: { id: string }) {
  return (
    <>
      <LinearGradient id={`${id}-e`} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FF9AA2" />
        <Stop offset="0.45" stopColor="#FF4D5A" />
        <Stop offset="1" stopColor="#D42C3A" />
      </LinearGradient>
      <Filter id={`${id}-g`} x="-80%" y="-80%" width="260%" height="260%">
        <FeGaussianBlur stdDeviation={3.2} />
      </Filter>
    </>
  );
}

/** V blanc et éclair rouge lumineux (halo derrière et devant le V). */
function VEclaire({ id }: { id: string }) {
  return (
    <>
      <Path d={LOGO.eclair} fill="#FF3B4A" filter={`url(#${id}-g)`} opacity={0.9} />
      <Path d={LOGO.v} fill="#FFFFFF" />
      <Path d={LOGO.eclair} fill="#FF3B4A" filter={`url(#${id}-g)`} opacity={0.35} />
      <Path d={LOGO.eclair} fill={`url(#${id}-e)`} />
    </>
  );
}

/** Symbole seul (V blanc, éclair rouge), pour l'écran de démarrage. */
export function SymboleSeul({ taille = 64, id = 'vs' }: { taille?: number; id?: string }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 96 96">
      <Defs>
        <DefsEclair id={id} />
      </Defs>
      <VEclaire id={id} />
    </Svg>
  );
}

/** Logo Volteo : V blanc traversé d'un éclair rouge, sur tuile noire. */
export function SymboleMarque({ taille = 32 }: { taille?: number }) {
  return (
    // Décoratif : masqué aux lecteurs d'écran (aria-hidden fonctionne en natif comme sur le web).
    <View aria-hidden>
      <Svg width={taille} height={taille} viewBox="0 0 96 96">
        <Defs>
          <LinearGradient id="vo-fond" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#1E1E23" />
            <Stop offset="1" stopColor="#0B0B0E" />
          </LinearGradient>
          <RadialGradient id="vo-halo" cx="0.52" cy="0.45" r="0.45">
            <Stop offset="0" stopColor="#E5434F" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#E5434F" stopOpacity={0} />
          </RadialGradient>
          <DefsEclair id="vo" />
        </Defs>
        <Rect width={96} height={96} rx={22} fill="url(#vo-fond)" />
        <Rect width={96} height={96} rx={22} fill="url(#vo-halo)" />
        <Rect x={0.75} y={0.75} width={94.5} height={94.5} rx={21.25} fill="none" stroke="#FFFFFF" strokeOpacity={0.12} strokeWidth={1.5} />
        <G transform="translate(48 48) scale(0.86) translate(-48 -47)">
          <VEclaire id="vo" />
        </G>
      </Svg>
    </View>
  );
}
