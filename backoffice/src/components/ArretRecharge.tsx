import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { mouvementReduit } from '../motion'

/**
 * Scène de la page de connexion (identique à l'app mobile) : une voiture électrique arrive,
 * s'arrête devant la borne, se recharge (énergie dans le câble, jauge qui se remplit) puis repart.
 * Tout est piloté par une timeline GSAP qui boucle ; les roues tournent selon la distance parcourue.
 */

// Repère de la scène (unités SVG) et de la voiture (dessin 320 × 140, réduit d'un facteur K).
const L = 640
const H = 176
const K = 0.56
const ROUTE = 132 // haut de la chaussée
const TROTTOIR = 90 // pied de la borne
const BORNE_X = 228
const HAUT_VOITURE = ROUTE - 140 * K + 10
const PRISE = { x: BORNE_X + 15, y: TROTTOIR - 58 + 33 }
const TRAPPE_Y = HAUT_VOITURE + 86 * K
const ARRET = PRISE.x - 60 * K // la trappe (x 60 du dessin) s'aligne sous la prise
const DEPART = -320 * K - 20
const SORTIE = L + 20
const RAYON_ROUE = 23 * K

/** Angle de roue correspondant à une distance parcourue (roulement sans glissement). */
const angle = (distance: number) => (distance / (2 * Math.PI * RAYON_ROUE)) * 360

function Roue({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g className="ar-roue" transform={`translate(${cx - 25} ${cy - 25}) scale(${46 / 50})`}>
      <circle cx={25} cy={25} r={24} fill="#0D0D10" />
      <circle cx={25} cy={25} r={15} fill="#D7E0EA" />
      <circle cx={25} cy={25} r={12.5} fill="#AFC0D2" />
      {[0, 72, 144, 216, 288].map((a) => (
        <rect key={a} x={23.6} y={13} width={2.8} height={12} rx={1.4} fill="#F5F5F7" transform={`rotate(${a} 25 25)`} />
      ))}
      <circle cx={25} cy={25} r={4} fill="#0D0D10" />
    </g>
  )
}

export default function ArretRecharge() {
  const racine = useRef<SVGSVGElement>(null)

  useGSAP(
    () => {
      const roues = gsap.utils.toArray<SVGGElement>('.ar-roue-pivot')
      const branche = '.ar-cable, .ar-energie'

      if (mouvementReduit()) {
        // Moins d'animations : la voiture reste garée, en charge.
        gsap.set('.ar-voiture', { x: ARRET })
        gsap.set(branche, { autoAlpha: 1 })
        gsap.set('.ar-jauge', { autoAlpha: 1 })
        gsap.set('.ar-niveau', { scaleX: 0.7 })
        return
      }

      gsap.set('.ar-voiture', { x: DEPART })
      gsap.set(branche, { autoAlpha: 0 })
      gsap.set('.ar-jauge', { autoAlpha: 0, y: 8 })
      gsap.set('.ar-niveau', { scaleX: 0.18, transformOrigin: '0% 50%' })
      gsap.set(roues, { transformOrigin: '50% 50%', rotation: 0 })

      // Énergie qui descend en continu dans le câble (visible seulement une fois branché).
      gsap.fromTo(
        '.ar-goutte',
        { attr: { cy: PRISE.y } },
        { attr: { cy: TRAPPE_Y }, duration: 0.7, ease: 'none', stagger: { each: 0.23, repeat: -1 } },
      )

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, delay: 0.8 })
      // 1. Arrivée : la voiture ralentit jusqu'à la borne, roues synchronisées.
      tl.to('.ar-voiture', { x: ARRET, duration: 1.8, ease: 'power3.out' }, 0)
        .to(roues, { rotation: angle(ARRET - DEPART), duration: 1.8, ease: 'power3.out' }, 0)
        // 2. Branchement et recharge.
        .to(branche, { autoAlpha: 1, duration: 0.25 }, 1.9)
        .to('.ar-ecran', { opacity: 1, duration: 0.3 }, 1.9)
        .to('.ar-jauge', { autoAlpha: 1, y: 0, duration: 0.4, ease: 'back.out(2)' }, 2.0)
        .to('.ar-niveau', { scaleX: 1, duration: 2.2, ease: 'power1.inOut' }, 2.1)
        // 3. Débranchement et départ.
        .to(branche, { autoAlpha: 0, duration: 0.2 }, 4.4)
        .to('.ar-ecran', { opacity: 0.35, duration: 0.3 }, 4.4)
        .to('.ar-jauge', { autoAlpha: 0, y: -6, duration: 0.3 }, 4.5)
        .to('.ar-voiture', { x: SORTIE, duration: 1.4, ease: 'power3.in' }, 4.6)
        .to(roues, { rotation: `+=${angle(SORTIE - ARRET)}`, duration: 1.4, ease: 'power3.in' }, 4.6)
        // 4. Remise à zéro hors champ.
        .set('.ar-voiture', { x: DEPART })
        .set(roues, { rotation: 0 })
        .set('.ar-niveau', { scaleX: 0.18 })
    },
    { scope: racine },
  )

  return (
    <svg ref={racine} className="arret-recharge" viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Une voiture électrique se recharge à une borne">
      <defs>
        <linearGradient id="ar-carrosserie" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF5A6E" />
          <stop offset="0.55" stopColor="#E5545F" />
          <stop offset="1" stopColor="#B83A46" />
        </linearGradient>
        <linearGradient id="ar-vitres" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2A2A31" />
          <stop offset="1" stopColor="#0D0D10" />
        </linearGradient>
        <linearGradient id="ar-reflet" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.5} />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </linearGradient>
        <filter id="ar-lueur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="flou" />
          <feMerge>
            <feMergeNode in="flou" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Trottoir et chaussée */}
      <rect x={0} y={TROTTOIR} width={L} height={10} rx={3} fill="#1E1E24" />
      <rect x={0} y={ROUTE} width={L} height={H - ROUTE} rx={14} fill="#1A1A1F" />
      <line x1={0} x2={L} y1={ROUTE} y2={ROUTE} stroke="#2E2E36" />
      <line x1={0} x2={L} y1={ROUTE + 22} y2={ROUTE + 22} stroke="#3A3A43" strokeWidth={3} strokeDasharray="20 20" strokeLinecap="round" />

      {/* Borne */}
      <g transform={`translate(${BORNE_X} ${TROTTOIR - 58})`}>
        <rect x={1} y={0} width={28} height={56} rx={8} fill="#2A2A31" />
        <rect x={6} y={6} width={18} height={16} rx={4} fill="#121215" />
        <rect className="ar-ecran" x={6} y={6} width={18} height={16} rx={4} fill="none" stroke="#E5545F" opacity={0.35} filter="url(#ar-lueur)" />
        <path d="M16 9 L11 16 L14.5 16 L13.5 21 L18.5 13.6 L15 13.6 Z" fill="#E5545F" />
        <rect x={10} y={30} width={10} height={6} rx={2} fill="#121215" />
      </g>

      {/* Jauge de charge */}
      <g className="ar-jauge" transform={`translate(${BORNE_X + 42} ${TROTTOIR - 64})`}>
        <rect width={92} height={26} rx={13} fill="#24242A" stroke="#34343C" />
        <path d="M17 6 L11 14 L15 14 L14 20 L20 12 L16 12 Z" fill="#E5545F" />
        <rect x={28} y={10} width={52} height={6} rx={3} fill="#34343C" />
        <rect className="ar-niveau" x={28} y={10} width={52} height={6} rx={3} fill="#E5545F" />
      </g>

      {/* Voiture */}
      <g className="ar-voiture">
        <g transform={`translate(0 ${HAUT_VOITURE}) scale(${K})`}>
          <ellipse cx={162} cy={131} rx={140} ry={7} fill="#000" opacity={0.35} />
          <path
            d="M22 100 C20 84 30 76 48 73 L98 66 C114 46 136 34 168 33 L206 33 C232 34 252 46 270 64 L292 70 C306 74 310 84 309 98 L308 104 C308 110 304 112 298 112 L268 112 C268 92 252 80 240 80 C226 80 212 92 212 112 L112 112 C112 92 98 80 84 80 C70 80 56 92 56 112 L30 112 C24 112 22 108 22 100 Z"
            fill="url(#ar-carrosserie)"
          />
          <path d="M110 66 C124 48 140 41 164 40 L176 40 L176 66 Z" fill="url(#ar-vitres)" />
          <path d="M184 40 L204 40 C224 41 240 50 254 66 L184 66 Z" fill="url(#ar-vitres)" />
          <path d="M118 61 C128 50 140 45 156 44 L150 61 Z" fill="#FFFFFF" opacity={0.18} />
          <path d="M60 74 L270 70 L270 74 L60 78 Z" fill="url(#ar-reflet)" opacity={0.7} />
          <path d="M178 68 L178 106" stroke="#B83A46" strokeWidth={1.5} opacity={0.6} />
          <rect x={150} y={76} width={16} height={3.5} rx={1.75} fill="#FFE4E8" opacity={0.85} />
          <rect x={196} y={76} width={16} height={3.5} rx={1.75} fill="#FFE4E8" opacity={0.85} />
          <path d="M292 80 C300 80 305 84 306 90 L292 90 Z" fill="#E9FBFF" />
          <path d="M306 85 L319 82 L319 94 L306 90 Z" fill="#E9FBFF" opacity={0.35} />
          <path d="M26 84 L36 82 L36 92 L25 93 Z" fill="#FF5B6B" />
          <circle cx={60} cy={86} r={5.5} fill="#0D0D10" />
          <path d="M61 82.5 L58 87 L60.5 87 L59.5 90 L62.6 85.4 L60 85.4 Z" fill="#E5545F" />
          <circle cx={84} cy={108} r={26} fill="#0D0D10" opacity={0.85} />
          <circle cx={240} cy={108} r={26} fill="#0D0D10" opacity={0.85} />
          <g className="ar-roue-pivot">
            <Roue cx={84} cy={108} />
          </g>
          <g className="ar-roue-pivot">
            <Roue cx={240} cy={108} />
          </g>
        </g>
      </g>

      {/* Câble branché sur la trappe, avec l'énergie qui y circule */}
      <line className="ar-cable" x1={PRISE.x} x2={PRISE.x} y1={PRISE.y} y2={TRAPPE_Y} stroke="#4A4A55" strokeWidth={3} strokeLinecap="round" />
      <g className="ar-energie" filter="url(#ar-lueur)">
        {[0, 1, 2].map((i) => (
          <circle key={i} className="ar-goutte" cx={PRISE.x} cy={PRISE.y} r={3} fill="#E5545F" />
        ))}
      </g>
    </svg>
  )
}
