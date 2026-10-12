import { usePlateforme } from '../hooks/usePlateforme'

/** Logo Volteo : V blanc traversé d'un éclair rouge, sur tuile noire (identique au favicon et à l'icône de l'app). */
export function SymboleMarque({ taille = 32 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 96 96" aria-hidden className="symbole-marque">
      <defs>
        <linearGradient id="vo-fond" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1E1E23" />
          <stop offset="1" stopColor="#0B0B0E" />
        </linearGradient>
        <radialGradient id="vo-halo" cx="0.52" cy="0.45" r="0.45">
          <stop offset="0" stopColor="#E5434F" stopOpacity="0.22" />
          <stop offset="1" stopColor="#E5434F" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vo-e" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF9AA2" />
          <stop offset="0.45" stopColor="#FF4D5A" />
          <stop offset="1" stopColor="#D42C3A" />
        </linearGradient>
        <filter id="vo-g" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
      <rect width="96" height="96" rx="22" fill="url(#vo-fond)" />
      <rect width="96" height="96" rx="22" fill="url(#vo-halo)" />
      <rect x="0.75" y="0.75" width="94.5" height="94.5" rx="21.25" fill="none" stroke="#FFFFFF" strokeOpacity="0.12" strokeWidth="1.5" />
      <g transform="translate(48 48) scale(0.86) translate(-48 -47)">
        <path d="M52 20 40 46h9l-4 18 14-26h-9l4-18z" fill="#FF3B4A" filter="url(#vo-g)" opacity="0.9" />
        <path d="M22 24h15l11 30 11-30h15L54 74H42z" fill="#FFFFFF" />
        <path d="M52 20 40 46h9l-4 18 14-26h-9l4-18z" fill="#FF3B4A" filter="url(#vo-g)" opacity="0.35" />
        <path d="M52 20 40 46h9l-4 18 14-26h-9l4-18z" fill="url(#vo-e)" />
      </g>
    </svg>
  )
}

/** Logo complet : logo téléversé (module 17) ou symbole + nom de la plateforme. */
export default function Marque({ replie = false, clair = false }: { replie?: boolean; clair?: boolean }) {
  const plateforme = usePlateforme()
  return (
    <span className={`marque-contenu${clair ? ' marque-contenu-clair' : ''}`}>
      {plateforme.logoUrl ? <img src={plateforme.logoUrl} alt={plateforme.nom} /> : <SymboleMarque />}
      {!replie && !plateforme.logoUrl && <span className="marque-nom">{plateforme.nom}</span>}
    </span>
  )
}
