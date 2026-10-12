import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/** Générateur pseudo-aléatoire déterministe : chaque borne garde la même scène. */
function graine(n: number) {
  let x = (n * 9301 + 49297) % 233280;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/**
 * Illustration de borne façon photo de nuit, utilisée tant qu'aucune photo réelle
 * n'a été ajoutée depuis le back-office : borne rapide (DC) ou wallbox sur pied (AC),
 * halo de l'écran, anneau LED, câble, lumières de ville floues et reflet au sol.
 */
export function PhotoBorneIllustree({ id, rapide }: { id: number; rapide: boolean }) {
  const alea = graine(id + 7);
  const bokeh = Array.from({ length: 14 }, () => ({
    x: alea() * 400,
    y: 20 + alea() * 90,
    r: 3 + alea() * 11,
    o: 0.08 + alea() * 0.22,
    rouge: alea() > 0.55,
  }));
  const decalage = 150 + alea() * 100;
  const g = `pb${id}`;

  return (
    <View style={{ width: '100%', height: '100%' }}>
      <Svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`${g}-ciel`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#09090C" />
            <Stop offset="0.6" stopColor="#1A1116" />
            <Stop offset="1" stopColor="#2A1219" />
          </LinearGradient>
          <LinearGradient id={`${g}-sol`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1C1C21" />
            <Stop offset="1" stopColor="#0B0B0E" />
          </LinearGradient>
          <LinearGradient id={`${g}-corps`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#2E2E36" />
            <Stop offset="0.45" stopColor="#4A4A55" />
            <Stop offset="1" stopColor="#1E1E24" />
          </LinearGradient>
          <RadialGradient id={`${g}-halo`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#E5545F" stopOpacity={0.55} />
            <Stop offset="1" stopColor="#E5545F" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`${g}-ecran`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFB4BE" />
            <Stop offset="1" stopColor="#E5545F" />
          </LinearGradient>
        </Defs>

        <Rect width={400} height={200} fill={`url(#${g}-ciel)`} />
        {/* Lumières de la ville, floues comme un arrière-plan photo */}
        {bokeh.map((b, i) => (
          <Circle key={i} cx={b.x} cy={b.y} r={b.r} fill={b.rouge ? '#E5545F' : '#F5F5F7'} opacity={b.o} />
        ))}
        {/* Auvent de la station */}
        <Path d={`M${decalage - 120} 38 L${decalage + 120} 30 L${decalage + 120} 40 L${decalage - 120} 46 Z`} fill="#141418" />
        <Rect x={decalage - 110} y={45} width={200} height={2} fill="#F2A3AA" opacity={0.5} />

        {/* Sol mouillé */}
        <Rect y={150} width={400} height={50} fill={`url(#${g}-sol)`} />
        <Ellipse cx={decalage} cy={156} rx={90} ry={12} fill={`url(#${g}-halo)`} />
        <Path d={`M0 162 L400 158`} stroke="#FFFFFF" strokeOpacity={0.05} />

        {/* Halo de la borne */}
        <Ellipse cx={decalage} cy={100} rx={80} ry={70} fill={`url(#${g}-halo)`} opacity={0.6} />

        {rapide ? (
          <G>
            {/* Borne rapide DC : colonne haute, écran, bandeau LED, deux pistolets */}
            <Rect x={decalage - 26} y={58} width={52} height={96} rx={8} fill={`url(#${g}-corps)`} />
            <Rect x={decalage - 26} y={58} width={52} height={10} rx={5} fill="#E5545F" />
            <Rect x={decalage - 17} y={76} width={34} height={24} rx={3} fill={`url(#${g}-ecran)`} opacity={0.9} />
            <Path d={`M${decalage + 2} 81 L${decalage - 4} 90 L${decalage} 90 L${decalage - 2} 96 L${decalage + 5} 87 L${decalage + 1} 87 Z`} fill="#FFFFFF" />
            <Rect x={decalage - 22} y={108} width={8} height={18} rx={3} fill="#0D0D10" />
            <Rect x={decalage + 14} y={108} width={8} height={18} rx={3} fill="#0D0D10" />
            <Path d={`M${decalage + 22} 120 C${decalage + 50} 128 ${decalage + 46} 150 ${decalage + 70} 152`} stroke="#0D0D10" strokeWidth={4} fill="none" />
            <Rect x={decalage - 26} y={146} width={52} height={3} fill="#E5545F" opacity={0.8} />
          </G>
        ) : (
          <G>
            {/* Wallbox AC sur pied */}
            <Rect x={decalage - 4} y={92} width={8} height={62} fill="#24242A" />
            <Rect x={decalage - 20} y={66} width={40} height={46} rx={10} fill={`url(#${g}-corps)`} />
            <Circle cx={decalage} cy={86} r={10} fill="none" stroke="#E5545F" strokeWidth={3} />
            <Path d={`M${decalage + 2} 80 L${decalage - 4} 88 L${decalage} 88 L${decalage - 2} 93 L${decalage + 5} 85 L${decalage + 1} 85 Z`} fill="#FFB4BE" />
            <Path d={`M${decalage + 18} 100 C${decalage + 40} 110 ${decalage + 34} 146 ${decalage + 60} 150`} stroke="#0D0D10" strokeWidth={3.5} fill="none" />
          </G>
        )}

        {/* Reflet de la borne dans le sol mouillé */}
        <Rect x={decalage - 24} y={156} width={48} height={30} fill="#E5545F" opacity={0.08} />
        {/* Vignettage */}
        <Rect width={400} height={200} fill="#000000" opacity={0.08} />
      </Svg>
    </View>
  );
}
