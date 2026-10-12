/**
 * Voiture du client à la borne (même scène que l'application mobile) : la voiture arrive
 * et se gare, le câble se déroule jusqu'à la trappe, l'énergie circule et l'écran de la
 * borne affiche la batterie. Animations CSS (désactivées si « réduire les animations »).
 */
const CARROSSERIE =
  'M24 112 C18 106 17 96 19 90 C20 82 25 78 33 75 L52 70 C72 57 96 44 122 38 C138 35 152 34 168 34 L212 34 C234 35 254 45 274 59 L286 66 C310 68 330 71 342 75 C351 79 354 88 353 98 L351 108 C350 111 348 112 344 112 L308 112 A30 30 0 0 0 248 112 L112 112 A30 30 0 0 0 52 112 Z'
const VITRES = 'M82 66 C102 51 126 43 152 40 L210 39 C230 41 248 50 268 64 L268 66 L82 67 Z'

function Roue({ cx }: { cx: number }) {
  return (
    <g className="vr-roue" style={{ transformOrigin: `${cx}px 114px` }}>
      <circle cx={cx} cy={114} r={26} fill="#121216" />
      <circle cx={cx} cy={114} r={17} fill="#121216" stroke="#C9CBD2" strokeWidth={2.4} />
      {[0, 72, 144, 216, 288].map((a) => (
        <rect key={a} x={cx - 1.4} y={97} width={2.8} height={15} rx={1.4} fill="#D7D9E0" transform={`rotate(${a} ${cx} 114)`} />
      ))}
      <path d={`M${cx - 15} ${106} A17 17 0 0 1 ${cx - 6} ${98} L${cx - 4} ${102} A13 13 0 0 0 ${cx - 11} ${108} Z`} fill="#E5545F" />
      <circle cx={cx} cy={114} r={4.5} fill="#1A1A1F" stroke="#C9CBD2" strokeWidth={1.2} />
    </g>
  )
}

export function VoitureRecharge({ batterie = 60, enCharge = true }: { batterie?: number; enCharge?: boolean }) {
  const niveau = Math.max(0, Math.min(100, Math.round(batterie)))
  // Câble : de la prise de la borne (x≈92) jusqu'à la trappe de la voiture (x≈163).
  const cable = 'M92 100 C110 104 104 150 128 150 S160 128 163 112'

  return (
    <svg className={`voiture-recharge${enCharge ? ' en-charge' : ''}`} viewBox="0 0 520 210" role="img" aria-label={`Votre voiture à la borne, batterie ${niveau} %`}>
      <defs>
        <linearGradient id="vr-peinture" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EE7883" />
          <stop offset="0.3" stopColor="#E5545F" />
          <stop offset="0.65" stopColor="#B83A46" />
          <stop offset="1" stopColor="#5E1A22" />
        </linearGradient>
        <linearGradient id="vr-vitres" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B3E4A" />
          <stop offset="1" stopColor="#0A0A0D" />
        </linearGradient>
        <linearGradient id="vr-borne" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3A3A42" />
          <stop offset="1" stopColor="#17171C" />
        </linearGradient>
        <radialGradient id="vr-halo">
          <stop offset="0" stopColor="#E5545F" stopOpacity="0.55" />
          <stop offset="1" stopColor="#E5545F" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vr-reflet" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="vr-forme">
          <path d={CARROSSERIE} />
        </clipPath>
      </defs>

      {/* Sol brillant */}
      <ellipse cx="300" cy="178" rx="250" ry="10" fill="#000" opacity="0.45" />
      <line x1="10" y1="172" x2="510" y2="172" stroke="#fff" strokeOpacity="0.08" />

      {/* Borne */}
      <g>
        <rect x="40" y="40" width="54" height="132" rx="10" fill="url(#vr-borne)" stroke="#ffffff22" />
        <rect className="vr-led" x="48" y="40" width="38" height="4" rx="2" fill="#E5545F" />
        <rect x="50" y="58" width="34" height="34" rx="5" fill="#0A0A0D" stroke="#ffffff1a" />
        <text className="vr-ecran" x="67" y="74" textAnchor="middle" fill="#F2A3AA" fontSize="11">⚡</text>
        <text className="vr-ecran" x="67" y="87" textAnchor="middle" fill="#F5F5F7" fontSize="11" fontWeight="700">{niveau}%</text>
        <circle cx="67" cy="104" r="9" fill="#0A0A0D" stroke="#E5545F88" strokeWidth="1.5" />
      </g>

      {/* Câble et énergie qui circule */}
      <path className="vr-cable" d={cable} fill="none" stroke="#0A0A0D" strokeWidth="6" strokeLinecap="round" pathLength={100} />
      <path className="vr-flux" d={cable} fill="none" stroke="#F2A3AA" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="4 10" />

      {/* Voiture (arrive de la droite et se gare) */}
      <g transform="translate(140 50)">
        <g className="vr-voiture">
        <ellipse className="vr-dessous" cx="185" cy="122" rx="150" ry="9" fill="url(#vr-halo)" />
        <path d={CARROSSERIE} fill="url(#vr-peinture)" />
        <path d="M40 84 C120 80 240 78 342 80" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.2" fill="none" />
        <path d={VITRES} fill="url(#vr-vitres)" />
        <rect x="164" y="39" width="6" height="28" fill="#0A0A0D" />
        <path d="M82 67 L268 66" stroke="#D9DBE2" strokeOpacity="0.7" strokeWidth="1.4" />
        <rect x="136" y="74" width="18" height="3" rx="1.5" fill="#fff" opacity="0.55" />
        <rect x="200" y="74" width="18" height="3" rx="1.5" fill="#fff" opacity="0.55" />
        <path d="M326 72 C336 73 346 75 351 79 L348 81 C340 78 332 76 324 75 Z" fill="#F4FBFF" />
        <path d="M18 84 C22 80 28 77 38 75 L38 78 C30 80 24 82 20 86 Z" fill="#FF2A45" />
        <circle className="vr-trappe" cx="23" cy="62" r="5" fill="#F2A3AA" />
        <g clipPath="url(#vr-forme)">
          <rect className="vr-eclat" x="-80" y="0" width="60" height="150" fill="url(#vr-reflet)" transform="skewX(-20)" />
        </g>
        <circle cx="82" cy="112" r="29" fill="#08080A" />
        <circle cx="278" cy="112" r="29" fill="#08080A" />
        <Roue cx={82} />
        <Roue cx={278} />
        </g>
      </g>
    </svg>
  )
}
