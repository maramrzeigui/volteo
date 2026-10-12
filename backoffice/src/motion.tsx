import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP, SplitText)

/**
 * Langage de mouvement Volteo (identique à l'app mobile) :
 * - entrées courtes (0,45 s), décalées de 40 ms, courbe « expo.out » : l'énergie arrive vite et se pose ;
 * - jamais de mouvement de mise en page : uniquement transform et opacity ;
 * - tout est coupé si l'utilisateur demande moins d'animations.
 */
export const EASE = 'expo.out'

export const mouvementReduit = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Éléments révélés en cascade à l'arrivée sur une page. */
const CIBLES_ENTREE = [
  '.en-tete-page',
  '.pile > .bandeau-encre',
  '.pile > .ant-row > .ant-col',
  '.pile > .ant-card',
  '.pile > .ant-tabs',
  '.pile > .ant-table-wrapper',
  '.pile > .ant-alert',
  '.pile > .pile > *',
  '[data-revele]',
].join(',')

/** Lignes de tableau / éléments de liste animés quand ils apparaissent (chargement, filtre, pagination). */
const LIGNES = '.ant-table-row, .ant-list-item'

const estVisible = (el: Element) => el.getBoundingClientRect().top < window.innerHeight * 0.92

/**
 * Transition de page :
 * - les blocs visibles apparaissent en cascade dès l'arrivée ;
 * - les blocs plus bas s'affichent directement (jamais masqués en attendant le défilement) ;
 * - les lignes de tableaux et de listes arrivent en cascade à chaque nouveau rendu.
 */
export function TransitionPage({ cle, children }: { cle: string; children: ReactNode }) {
  const racine = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (mouvementReduit() || !racine.current) return
      const cibles = gsap.utils.toArray<HTMLElement>(CIBLES_ENTREE, racine.current).slice(0, 40)
      if (cibles.length === 0) {
        gsap.from(racine.current, { autoAlpha: 0, y: 10, duration: 0.4, ease: EASE, clearProps: 'transform,opacity,visibility' })
        return
      }
      const visibles = cibles.filter(estVisible)

      // Sur-titre : les lettres s'allument une à une, comme une enseigne.
      const surtitre = racine.current.querySelector<HTMLElement>('.en-tete-page .surtitre')
      if (surtitre && surtitre.children.length === 0 && surtitre.textContent?.trim()) {
        const lettres = SplitText.create(surtitre, { type: 'chars' })
        gsap.from(lettres.chars, {
          autoAlpha: 0,
          y: 6,
          duration: 0.4,
          ease: 'power2.out',
          stagger: 0.018,
          delay: 0.1,
          onComplete: () => lettres.revert(),
        })
      }

      // Titre de page : les mots montent derrière un masque (seulement pour un titre en texte simple).
      const titre = racine.current.querySelector<HTMLElement>('.en-tete-page h3')
      if (titre && titre.children.length === 0 && titre.textContent?.trim()) {
        const decoupe = SplitText.create(titre, { type: 'words', mask: 'words' })
        gsap.from(decoupe.words, {
          yPercent: 110,
          duration: 0.8,
          ease: EASE,
          stagger: 0.06,
          delay: 0.05,
          // Le texte d'origine est rendu à React dès la fin de l'animation.
          onComplete: () => decoupe.revert(),
        })
      }

      // Entrée sobre des blocs visibles. Les blocs plus bas ne sont JAMAIS masqués en attendant
      // le défilement : un déclencheur qui ne se produirait pas laisserait du contenu invisible.
      gsap.from(visibles, {
        autoAlpha: 0,
        y: 12,
        duration: 0.45,
        ease: EASE,
        stagger: 0.035,
        clearProps: 'transform,opacity,visibility',
      })
    },
    { scope: racine, dependencies: [cle], revertOnUpdate: true },
  )

  // Nouvelles lignes ajoutées au DOM → entrée en cascade (regroupées par image).
  useEffect(() => {
    const el = racine.current
    if (!el || mouvementReduit()) return
    let attente: Element[] = []
    let image = 0
    const deja = new WeakSet<Element>()
    el.querySelectorAll(LIGNES).forEach((n) => deja.add(n))

    const jouer = () => {
      image = 0
      const lot = attente.filter((n) => n.isConnected).slice(0, 30)
      attente = []
      if (lot.length) {
        gsap.from(lot, { autoAlpha: 0, y: 8, duration: 0.4, ease: 'power2.out', stagger: 0.025, clearProps: 'transform,opacity,visibility' })
      }
    }

    const observateur = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return
          const lignes = n.matches(LIGNES) ? [n] : Array.from(n.querySelectorAll(LIGNES))
          lignes.forEach((l) => {
            if (deja.has(l)) return
            deja.add(l)
            attente.push(l)
          })
        })
      }
      if (attente.length && !image) image = requestAnimationFrame(jouer)
    })
    observateur.observe(el, { childList: true, subtree: true })
    return () => {
      observateur.disconnect()
      if (image) cancelAnimationFrame(image)
    }
  }, [cle])

  return (
    <div ref={racine} className="transition-page">
      {children}
    </div>
  )
}

/**
 * Halo lumineux qui suit le pointeur sur les cartes (variables CSS --mx / --my).
 * Un seul écouteur pour toute l'application, synchronisé sur l'affichage.
 */
export function activerHaloCartes() {
  if (typeof window === 'undefined' || !window.matchMedia('(hover: hover)').matches) return
  let image = 0
  let derniere: PointerEvent | null = null
  window.addEventListener(
    'pointermove',
    (e) => {
      derniere = e
      if (image) return
      image = requestAnimationFrame(() => {
        image = 0
        const ev = derniere
        if (!ev) return
        const carte = (ev.target as Element | null)?.closest?.<HTMLElement>('.ant-card, .bandeau-encre')
        if (!carte) return
        const r = carte.getBoundingClientRect()
        carte.style.setProperty('--mx', `${ev.clientX - r.left}px`)
        carte.style.setProperty('--my', `${ev.clientY - r.top}px`)
      })
    },
    { passive: true },
  )
}

/** Analyse « 1 234,5 kWh » → nombre, nombre de décimales et position dans le texte. */
function extraireNombre(texte: string) {
  const m = texte.match(/-?\d[\d\s  ]*(?:[.,]\d+)?/)
  if (!m || m.index === undefined) return null
  const brut = m[0]
  const decimales = brut.match(/[.,](\d+)$/)?.[1].length ?? 0
  const valeur = Number(brut.replace(/[\s  ]/g, '').replace(',', '.'))
  if (!Number.isFinite(valeur)) return null
  return { valeur, decimales, avant: texte.slice(0, m.index), apres: texte.slice(m.index + brut.length) }
}

/** Compteur animé : les valeurs des KPI « montent » jusqu'à leur valeur réelle. */
export function ChiffreAnime({ valeur }: { valeur: ReactNode }) {
  const span = useRef<HTMLSpanElement>(null)
  const precedent = useRef(0)
  const texte =
    typeof valeur === 'number'
      ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(valeur)
      : typeof valeur === 'string'
        ? valeur
        : null
  const nombre = texte ? extraireNombre(texte) : null

  useLayoutEffect(() => {
    if (!nombre || !span.current || mouvementReduit()) {
      if (nombre) precedent.current = nombre.valeur
      return
    }
    const format = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: nombre.decimales,
      maximumFractionDigits: nombre.decimales,
    })
    const etat = { v: precedent.current }
    const el = span.current
    el.textContent = nombre.avant + format.format(etat.v) + nombre.apres
    const tween = gsap.to(etat, {
      v: nombre.valeur,
      duration: precedent.current === 0 ? 1.1 : 0.6,
      ease: 'power3.out',
      onUpdate: () => {
        el.textContent = nombre.avant + format.format(etat.v) + nombre.apres
      },
      onComplete: () => {
        el.textContent = texte
        precedent.current = nombre.valeur
      },
    })
    return () => {
      tween.kill()
    }
    // Relancé uniquement quand le texte affiché change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texte])

  if (!texte) return <>{valeur}</>
  return (
    <span ref={span} className="chiffre">
      {texte}
    </span>
  )
}
