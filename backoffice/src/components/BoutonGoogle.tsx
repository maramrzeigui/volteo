import { useEffect, useRef, useState } from 'react'
import { usePlateforme } from '../hooks/usePlateforme'
import Dialogue from './Dialogue'

type IdentiteGoogle = {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; use_fedcm_for_prompt?: boolean }) => void
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
    }
  }
}
declare global {
  interface Window { google?: IdentiteGoogle }
}

let chargement: Promise<void> | null = null
/** Charge une seule fois le script Google Identity Services. */
function chargerGoogle(): Promise<void> {
  chargement ??= new Promise((ok, ko) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => ok()
    s.onerror = () => ko(new Error('Google indisponible'))
    document.head.appendChild(s)
  })
  return chargement
}

const LogoG = () => (
  <svg width="26" height="26" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
)

/**
 * « Continuer avec Google » : bouton rond comme dans l'application. Le vrai bouton Google
 * (invisible) est posé par-dessus pour ouvrir la fenêtre de connexion Google.
 */
export default function BoutonGoogle({ onJeton, desactive }: { onJeton: (idToken: string) => void; desactive?: boolean }) {
  const { googleClientId } = usePlateforme()
  const calque = useRef<HTMLDivElement>(null)
  const [pret, setPret] = useState(false)
  const [info, setInfo] = useState(false)
  const rappel = useRef(onJeton)
  rappel.current = onJeton

  useEffect(() => {
    if (!googleClientId) return
    let annule = false
    chargerGoogle()
      .then(() => {
        if (annule || !window.google || !calque.current) return
        window.google.accounts.id.initialize({ client_id: googleClientId, callback: (r) => rappel.current(r.credential), use_fedcm_for_prompt: true })
        window.google.accounts.id.renderButton(calque.current, { type: 'icon', shape: 'circle', size: 'large', theme: 'outline' })
        setPret(true)
      })
      .catch(() => setPret(false))
    return () => {
      annule = true
    }
  }, [googleClientId])

  return (
    <>
      <div className="bouton-google">
        <button type="button" aria-label="Continuer avec Google" disabled={desactive} onClick={() => !pret && setInfo(true)}>
          <LogoG />
        </button>
        {googleClientId && <div ref={calque} className="bouton-google-calque" style={{ pointerEvents: pret && !desactive ? 'auto' : 'none' }} />}
      </div>
      <Dialogue
        open={info}
        icone={<span style={{ fontWeight: 600 }}>G</span>}
        titre="Google bientôt disponible"
        texte="La connexion Google sera activée dès que l’identifiant client OAuth de l’application aura été configuré."
        confirmer="Compris"
        onConfirmer={() => setInfo(false)}
      />
    </>
  )
}
