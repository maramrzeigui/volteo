import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  AudioMutedOutlined,
  SoundOutlined,
  FlagOutlined,
  ThunderboltFilled,
  WarningFilled,
} from '@ant-design/icons'
import L from 'leaflet'
import { Marker, Polyline, useMap } from 'react-leaflet'
import { alerteAutonomie, alerteBatterie, alerteEcart, alertesTrajet, autonomieKm, batterieA, kmParSeconde, Parcours, phraseGuidage, type AlerteConduite } from '../lib/conduite'
import { activerVoix, bip, parler, voixActive } from '../lib/voix'
import { useQuery } from '@tanstack/react-query'
import { espace } from '../api'
import { formatDuree } from '../format'
import type { TrajetVolta } from '../types'
import Dialogue from './Dialogue'

export type EtatConduite = ReturnType<typeof useConduite>

/**
 * Conduite sur le trajet : la voiture avance le long de l'itinéraire (simulation sur le web),
 * la batterie baisse, et Volta prévient à l'approche des bornes, en cas de batterie faible et à l'arrivée.
 */
export function useConduite(trajet: TrajetVolta | null) {
  const parcours = useMemo(() => (trajet && trajet.trace.length > 1 ? new Parcours(trajet.trace, trajet.distanceKm) : null), [trajet])
  const alertes = useMemo(() => (trajet && parcours ? alertesTrajet(trajet.etapes, parcours.total) : []), [trajet, parcours])
  const instructionsKm = useMemo(() => {
    if (!trajet || !parcours) return []
    let avant = 0
    return trajet.instructions.map((g) => (avant = parcours.projeter(g, avant)))
  }, [trajet, parcours])

  const [actif, setActif] = useState(false)
  const [km, setKm] = useState(0)
  const [pause, setPause] = useState(false)
  const [vitesse, setVitesse] = useState(1)
  const [mode, setMode] = useState<'gps' | 'simulation'>('simulation')
  const [gps, setGps] = useState<{ lat: number; lng: number; cap: number | null } | null>(null)
  const [alerte, setAlerte] = useState<AlerteConduite | null>(null)
  const [bandeau, setBandeau] = useState<AlerteConduite | null>(null)
  const vues = useRef(new Set<string>())
  const rechargees = useRef(new Set<string>())
  const annoncee = useRef(-1)
  const [voix, setVoix] = useState(voixActive)
  const { data: vehicules } = useQuery({ queryKey: ['espace', 'vehicules'], queryFn: espace.vehicules })
  const capacite = vehicules?.[0]?.capaciteBatterieKwh ?? 60

  /** Démarrer : GPS du navigateur si l'on est sur l'itinéraire, sinon simulation. */
  const demarrer = (depart?: { lat: number; lng: number } | null) => {
    setMode(depart && parcours && parcours.ecart(depart) < 1 && 'geolocation' in navigator ? 'gps' : 'simulation')
    setVitesse(1)
    setGps(null)
    vues.current = new Set()
    rechargees.current = new Set()
    setKm(0)
    setPause(false)
    setAlerte(null)
    setBandeau(null)
    setActif(true)
    annoncee.current = -1
    bip('info')
    parler(`C’est parti. ${trajet ? `${trajet.distanceKm} kilomètres jusqu’à ${trajet.arrivee}.` : ''}`, true)
  }
  const arreter = () => {
    window.speechSynthesis?.cancel()
    setActif(false)
    setAlerte(null)
    setBandeau(null)
  }

  // Avance de la voiture, 10 fois par seconde.
  useEffect(() => {
    if (!actif || pause || alerte || !parcours || mode !== 'simulation') return
    const pas = kmParSeconde(parcours.total) * vitesse * 0.1
    const t = setInterval(() => setKm((k) => Math.min(parcours.total, k + pas)), 100)
    return () => clearInterval(t)
  }, [actif, pause, alerte, parcours, vitesse, mode])

  // GPS : position réelle du navigateur projetée sur l'itinéraire.
  useEffect(() => {
    if (!actif || !parcours || mode !== 'gps') return
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const ici = { lat: p.coords.latitude, lng: p.coords.longitude }
        setGps({ ...ici, cap: p.coords.heading })
        setKm((k) => parcours.projeter(ici, k))
      },
      () => setMode('simulation'),
      { enableHighAccuracy: true },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [actif, parcours, mode])

  const batterie = trajet ? batterieA(trajet.etapes, km, rechargees.current) : 0

  // Alertes du trajet au kilomètre où elles se déclenchent, avec son et voix.
  useEffect(() => {
    if (!actif || !trajet || alerte) return
    const a =
      alertes.find((x) => x.km <= km && !vues.current.has(x.cle)) ??
      alerteBatterie(trajet.etapes, km, batterie, vues.current) ??
      alerteAutonomie(trajet.etapes, km, batterie, capacite, rechargees.current, vues.current) ??
      (mode === 'gps' && gps && parcours ? alerteEcart(parcours.ecart(gps), vues.current) : null)
    if (!a) return
    vues.current.add(a.cle)
    bip(a.type === 'approche' || a.type === 'arrivee' ? 'info' : 'alerte')
    parler(`${a.titre}. ${a.texte}`, true)
    if (a.pause) setAlerte(a)
    else {
      setBandeau(a)
      setTimeout(() => setBandeau((b) => (b?.cle === a.cle ? null : b)), 8000)
    }
  }, [actif, km, alertes, batterie, trajet, alerte, capacite, mode, gps, parcours])

  const index = instructionsKm.findIndex((k) => k > km + 0.03)
  const consigne = trajet && index >= 0 ? { ...trajet.instructions[index], dansKm: instructionsKm[index] - km } : null
  const suivante = trajet && index >= 0 ? trajet.instructions[index + 1] : undefined
  const resteKm = parcours ? Math.max(0, parcours.total - km) : 0

  // Guidage vocal : chaque manœuvre est annoncée une fois, à 300 m environ.
  useEffect(() => {
    if (!actif || index < 0 || !consigne || alerte) return
    if (index !== annoncee.current && consigne.dansKm < 0.35) {
      annoncee.current = index
      parler(phraseGuidage(consigne.texte, consigne.dansKm))
    }
  }, [actif, index, consigne, alerte])
  const recharges = (trajet?.etapes ?? []).filter((e) => e.type === 'recharge' && e.km > km).reduce((t, e) => t + (e.type === 'recharge' ? e.minutes : 0), 0)
  const minutes = Math.round((resteKm / 70) * 60) + recharges

  return {
    actif, km, pause, vitesse, alerte, bandeau, batterie, consigne, suivante, resteKm, minutes, parcours,
    mode,
    voix,
    autonomie: Math.round(autonomieKm(batterie, capacite)),
    basculerVoix: () => setVoix((v) => {
      activerVoix(!v)
      return !v
    }),
    position: parcours && actif ? (mode === 'gps' && gps ? { ...parcours.position(km), lat: gps.lat, lng: gps.lng } : parcours.position(km)) : null,
    simuler: () => setMode('simulation'),
    demarrer, arreter,
    basculerPause: () => setPause((p) => !p),
    accelerer: () => setVitesse((v) => (v >= 4 ? 1 : v * 2)),
    fermerAlerte: (recharger: boolean) => {
      if (alerte?.type === 'borne' && alerte.borneId && recharger) {
        rechargees.current.add(`borne-${alerte.borneId}`)
        // Batterie rechargée : les alertes de batterie pourront se redéclencher plus loin.
        vues.current.delete('batterie_faible')
        vues.current.delete('batterie_critique')
        const fin = trajet ? batterieA(trajet.etapes, km, rechargees.current) : 0
        const info: AlerteConduite = { cle: `recharge-${alerte.borneId}`, km, type: 'approche', titre: `Recharge terminée : ${fin} %`, texte: 'Vous pouvez reprendre la route. Bon trajet !' }
        setBandeau(info)
        setTimeout(() => setBandeau((b) => (b?.cle === info.cle ? null : b)), 5000)
      }
      if (alerte?.type === 'arrivee') setActif(false)
      setAlerte(null)
    },
  }
}

const ICONE_VOITURE = (cap: number) =>
  L.divIcon({
    className: '',
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    html: `<div class="voiture-conduite" style="transform: rotate(${cap}deg)">
      <svg viewBox="0 0 46 46" width="46" height="46"><circle cx="23" cy="23" r="21" fill="#E5545F33"/>
      <rect x="14" y="7" width="18" height="32" rx="8" fill="#E5545F" stroke="#fff" stroke-width="2"/>
      <rect x="17" y="13" width="12" height="7" rx="2.5" fill="#1A1A1F"/><rect x="17" y="27" width="12" height="5" rx="2" fill="#1A1A1F"/>
      <rect x="16" y="8" width="4" height="2" rx="1" fill="#FFF8D6"/><rect x="26" y="8" width="4" height="2" rx="1" fill="#FFF8D6"/></svg></div>`,
  })

/**
 * Voiture sur la carte : la caméra la suit (voiture dans le tiers bas de l'écran, route devant elle),
 * et seul l'itinéraire restant est dessiné, il se raccourcit à mesure que la voiture avance.
 */
export function VoitureSurCarte({ conduite }: { conduite: EtatConduite }) {
  const map = useMap()
  const { position, parcours, km, actif } = conduite
  useEffect(() => {
    if (actif) map.closePopup()
  }, [actif, map])
  useEffect(() => {
    if (!actif || !position) return
    const zoom = Math.max(map.getZoom(), 16)
    const point = map.project([position.lat, position.lng], zoom)
    // Centre décalé vers le haut : la voiture apparaît sous le centre, comme dans une appli GPS.
    const centre = map.unproject(point.subtract([0, map.getSize().y * 0.18]), zoom)
    map.setView(centre, zoom, { animate: false })
  }, [actif, position, map])
  if (!actif || !position || !parcours) return null
  const restant: [number, number][] = [[position.lat, position.lng], ...parcours.points.filter((_, i) => parcours.cumul[i] > km).map((p) => [p.lat, p.lng] as [number, number])]
  return (
    <>
      {restant.length > 1 && (
        <>
          <Polyline positions={restant} pathOptions={{ color: '#FFFFFF', weight: 11, opacity: 0.9 }} interactive={false} />
          <Polyline positions={restant} pathOptions={{ color: '#E5545F', weight: 7 }} interactive={false} />
        </>
      )}
      <Marker position={[position.lat, position.lng]} icon={ICONE_VOITURE(position.cap)} zIndexOffset={1000} interactive={false} />
    </>
  )
}

const flecheConsigne = (texte: string) =>
  /gauche/i.test(texte) ? <ArrowLeftOutlined /> : /droite/i.test(texte) ? <ArrowRightOutlined /> : /arriv/i.test(texte) ? <FlagOutlined /> : <ArrowUpOutlined />
const distance = (km: number) => (km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toLocaleString('fr-FR', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`)

/** Bandeaux de conduite par-dessus la carte : consigne, alerte, batterie et arrivée. */
export function PanneauConduite({ conduite }: { conduite: EtatConduite }) {
  const c = conduite
  if (!c.actif) return null
  const arrivee = new Date(Date.now() + c.minutes * 60000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const alerteIcone = c.alerte?.type === 'arrivee' ? <FlagOutlined /> : <ThunderboltFilled />

  return (
    <>
      <div className="conduite-haut">
        {c.consigne && (
          <div className="conduite-consigne">
            <div className="conduite-consigne-haut">
              <span className="conduite-fleche">{flecheConsigne(c.consigne.texte)}</span>
              <div>
                <strong>{distance(c.consigne.dansKm)}</strong>
                <span dir="auto">{c.consigne.texte}</span>
              </div>
            </div>
            {c.suivante && <div className="conduite-ensuite" dir="auto">Ensuite : {c.suivante.texte}</div>}
          </div>
        )}
        {c.bandeau && (
          <div className={`conduite-alerte ${c.bandeau.type}`} role="alert">
            {c.bandeau.type.startsWith('batterie') ? <WarningFilled /> : <ThunderboltFilled />}
            <div>
              <strong>{c.bandeau.titre}</strong>
              <span>{c.bandeau.texte}</span>
            </div>
          </div>
        )}
      </div>

      <div className="conduite-bas">
        <div className={`conduite-batterie${c.batterie < 20 ? ' faible' : ''}`}>
          {c.batterie < 20 ? <WarningFilled /> : <ThunderboltFilled />}
          <strong>{c.batterie} %</strong>
        </div>
        <div className="conduite-infos">
          <strong>{arrivee}</strong>
          <span>{distance(c.resteKm)} · {formatDuree(c.minutes)} · autonomie ≈ {c.autonomie} km</span>
        </div>
        <button type="button" className="conduite-rond" onClick={c.basculerVoix} aria-label={c.voix ? 'Couper le son' : 'Activer le son'}>
          {c.voix ? <SoundOutlined /> : <AudioMutedOutlined />}
        </button>
        <button type="button" className="conduite-rond" onClick={c.mode === 'simulation' ? c.accelerer : c.simuler}
          title={c.mode === 'simulation' ? 'Vitesse de la simulation' : 'Simuler la conduite'}>
          {c.mode === 'simulation' ? `×${c.vitesse}` : 'Simuler'}
        </button>
        <button type="button" className="conduite-arreter" onClick={c.arreter}>Arrêter</button>
      </div>

      <Dialogue
        open={!!c.alerte}
        icone={alerteIcone}
        titre={c.alerte?.titre ?? ''}
        texte={c.alerte?.texte}
        annuler={c.alerte?.type === 'borne' ? 'Sans recharger' : undefined}
        confirmer={c.alerte?.type === 'borne' ? 'Recharger' : 'Terminer'}
        onAnnuler={() => c.fermerAlerte(false)}
        onConfirmer={() => c.fermerAlerte(true)}
      />
    </>
  )
}
