import { Fragment, useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ApiOutlined, BarChartOutlined, ToolOutlined, WalletOutlined } from '@ant-design/icons'
import ArretRecharge from './ArretRecharge'
import Marque from './Marque'
import { EASE, mouvementReduit } from '../motion'

const ATOUTS = [
  { icone: <ApiOutlined />, texte: 'Supervision OCPP' },
  { icone: <ToolOutlined />, texte: 'Maintenance' },
  { icone: <WalletOutlined />, texte: 'Facturation' },
  { icone: <BarChartOutlined />, texte: 'Rapports' },
]

const TITRE = ['Pilotez', 'votre', 'réseau', 'de', 'recharge', 'en', 'temps', 'réel.']
const ACCENT = 5 // les mots à partir de cet index sont en rouge

/** Panneau visuel de la page de connexion : titre animé et voiture électrique qui vient se recharger. */
export default function HeroConnexion() {
  const racine = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (mouvementReduit()) return

      const tl = gsap.timeline({ defaults: { ease: EASE } })
      tl.from('.marque-contenu', { autoAlpha: 0, y: -12, duration: 0.6 })
        .from('.connexion-surtitre', { autoAlpha: 0, x: -24, duration: 0.7 }, 0.15)
        .from('.connexion-titre .mot > span', { yPercent: 110, duration: 0.9, stagger: 0.06 }, 0.3)
        .from('.connexion-texte', { autoAlpha: 0, y: 16, duration: 0.8 }, 0.7)
        .from('.connexion-scene', { autoAlpha: 0, y: 24, duration: 0.9 }, 0.8)
        .from('.connexion-atout', { autoAlpha: 0, y: 14, duration: 0.6, stagger: 0.07 }, 0.95)
        .from('.connexion-pied', { autoAlpha: 0, duration: 0.6 }, 1.2)

      // Légère parallaxe de la scène au survol de la souris.
      const scene = racine.current?.querySelector('.connexion-scene')
      if (!scene) return
      const x = gsap.quickTo(scene, 'x', { duration: 1.2, ease: 'power3.out' })
      const y = gsap.quickTo(scene, 'y', { duration: 1.2, ease: 'power3.out' })
      const bouger = (e: PointerEvent) => {
        const r = racine.current!.getBoundingClientRect()
        x(((e.clientX - r.left) / r.width - 0.5) * -14)
        y(((e.clientY - r.top) / r.height - 0.5) * -8)
      }
      racine.current!.addEventListener('pointermove', bouger)
      return () => racine.current?.removeEventListener('pointermove', bouger)
    },
    { scope: racine },
  )

  return (
    <div className="connexion-visuel" ref={racine}>
      <Marque />

      <div>
        <span className="surtitre connexion-surtitre">Recharge électrique · Tunisie</span>
        <h1 className="connexion-titre">
          {TITRE.map((mot, i) => (
            <Fragment key={i}>
              <span className="mot">
                <span>{i >= ACCENT ? <em>{mot}</em> : mot}</span>
              </span>{' '}
            </Fragment>
          ))}
        </h1>
        <p className="connexion-texte">
          Supervision des bornes, sessions, maintenance, facturation et rapports réunis dans une seule plateforme.
        </p>
        <div className="connexion-scene">
          <ArretRecharge />
        </div>
      </div>

      <div className="pile" style={{ gap: 20 }}>
        <div className="connexion-atouts">
          {ATOUTS.map((a) => (
            <span className="connexion-atout" key={a.texte}>
              {a.icone}
              {a.texte}
            </span>
          ))}
        </div>
        <span className="connexion-pied">Protocole OCPP 1.6J · © {new Date().getFullYear()}</span>
      </div>
    </div>
  )
}
