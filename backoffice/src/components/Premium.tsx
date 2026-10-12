import { useId, useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { EASE, mouvementReduit } from '../motion'

/** Mini-courbe de tendance (aire dégradée + trait), tracée par GSAP à l'apparition. */
export function Sparkline({
  valeurs,
  couleur = '#E5545F',
  hauteur = 40,
  epaisseur = 2,
}: {
  valeurs: number[]
  couleur?: string
  hauteur?: number
  epaisseur?: number
}) {
  const id = useId().replace(/:/g, '')
  const racine = useRef<SVGSVGElement>(null)
  const L = 200
  const pts = valeurs.length > 1 ? valeurs : [0, 0]
  const max = Math.max(...pts, 1)
  const min = Math.min(...pts, 0)
  const marge = epaisseur + 2
  const xy = pts.map((v, i) => [
    (i / (pts.length - 1)) * L,
    marge + (1 - (v - min) / (max - min || 1)) * (hauteur - marge * 2),
  ])
  // Courbe lissée (Catmull-Rom → Bézier) sans dépassement notable.
  const d = xy.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`
    const [x0, y0] = xy[i - 1]
    const cx = (x - x0) / 2
    return `${acc} C${x0 + cx},${y0} ${x - cx},${y} ${x},${y}`
  }, '')

  useGSAP(
    () => {
      if (mouvementReduit()) return
      // La courbe se dévoile de gauche à droite (masque animé : compatible avec un trait non déformé).
      const masque = racine.current?.querySelector('.sparkline-masque')
      if (!masque) return
      gsap.fromTo(masque, { attr: { width: 0 } }, { attr: { width: L }, duration: 1.3, ease: 'power2.inOut', delay: 0.15 })
    },
    { scope: racine, dependencies: [d], revertOnUpdate: true },
  )

  return (
    <svg ref={racine} className="sparkline" viewBox={`0 0 ${L} ${hauteur}`} preserveAspectRatio="none" height={hauteur} aria-hidden>
      <defs>
        <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={couleur} stopOpacity="0.22" />
          <stop offset="1" stopColor={couleur} stopOpacity="0" />
        </linearGradient>
        <clipPath id={`clip${id}`}>
          <rect className="sparkline-masque" x="0" y="-10" width={L} height={hauteur + 20} />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip${id})`}>
        <path d={`${d} L${L},${hauteur} L0,${hauteur} Z`} fill={`url(#sp${id})`} />
        <path d={d} fill="none" stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  )
}

/** Anneau de progression (0–100) qui se remplit à l'apparition. */
export function Anneau({
  pourcentage,
  taille = 132,
  epaisseur = 10,
  couleur = '#E5545F',
  piste = 'rgba(255,255,255,.08)',
  children,
}: {
  pourcentage: number
  taille?: number
  epaisseur?: number
  couleur?: string
  piste?: string
  children?: ReactNode
}) {
  const racine = useRef<HTMLDivElement>(null)
  const r = (taille - epaisseur) / 2
  const valeur = Math.max(0, Math.min(100, pourcentage)) / 100

  useGSAP(
    () => {
      const arc = racine.current?.querySelector('.anneau-arc')
      if (!arc) return
      if (mouvementReduit()) {
        gsap.set(arc, { strokeDashoffset: 1 - valeur })
        return
      }
      gsap.fromTo(arc, { strokeDashoffset: 1 }, { strokeDashoffset: 1 - valeur, duration: 1.4, ease: EASE, delay: 0.2 })
    },
    { scope: racine, dependencies: [valeur] },
  )

  return (
    <div ref={racine} className="anneau" style={{ width: taille, height: taille }}>
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} aria-hidden>
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke={piste} strokeWidth={epaisseur} />
        <circle
          className="anneau-arc"
          cx={taille / 2}
          cy={taille / 2}
          r={r}
          fill="none"
          stroke={couleur}
          strokeWidth={epaisseur}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - valeur}
          transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
          style={{ filter: `drop-shadow(0 0 8px ${couleur}66)` }}
        />
      </svg>
      <div className="anneau-centre">{children}</div>
    </div>
  )
}
