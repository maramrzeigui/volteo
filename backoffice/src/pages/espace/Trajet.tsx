import { useEffect, useMemo, useState } from 'react'
import { AutoComplete, Button, Input, Space, Spin, Tag, Typography } from 'antd'
import { AimOutlined, ArrowLeftOutlined, BorderOuterOutlined, CompassOutlined, EnvironmentOutlined, GlobalOutlined, InfoCircleOutlined, MinusOutlined, PlusOutlined, SearchOutlined, SendOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import { Link, useSearchParams } from 'react-router-dom'
import { FONDS_CARTE } from '../../components/FondCarte'
import { PanneauConduite, useConduite, VoitureSurCarte } from '../../components/Conduite'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { errorMessage, espace } from '../../api'
import { formatDuree, formatMontant } from '../../format'
import type { Borne, LieuTrouve, PointTrajet, TrajetVolta } from '../../types'

const TUNIS: PointTrajet = { nom: 'Tunis', lat: 36.8065, lng: 10.1815 }

/** Fonds de carte : satellite (Esri World Imagery + noms de lieux) ou plan (OpenStreetMap). */
const FONDS = {
  satellite: [
    { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics' },
    { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', attribution: '' },
    { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', attribution: '' },
  ],
  plan: FONDS_CARTE.plan,
}

const icone = (html: string, taille = 30) => L.divIcon({ className: '', html, iconSize: [taille, taille], iconAnchor: [taille / 2, taille / 2] })
const ICONE_MOI = icone('<div class="carte-moi"></div>', 20)
const ICONE_EPINGLE = L.divIcon({ className: '', html: '<div class="carte-epingle"></div>', iconSize: [30, 40], iconAnchor: [15, 40] })
const iconeBorne = (numero: number | null, attenuee: boolean) =>
  icone(`<div class="carte-borne${numero ? ' arret' : ''}${attenuee && !numero ? ' attenuee' : ''}">${numero ?? '⚡'}</div>`, numero ? 34 : 28)

/** Toucher la carte : épingle à l'endroit choisi. */
function SurClic({ onClic }: { onClic: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClic(e.latlng.lat, e.latlng.lng) })
  return null
}

/** Cadre le trajet, la destination ou ma position. */
function Cadrage({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 1) map.flyToBounds(L.latLngBounds(points), { padding: [60, 60], duration: 0.8 })
    else if (points.length === 1) map.flyTo(points[0], 13, { duration: 0.8 })
  }, [map, points])
  return null
}

/** Boutons + / − et « ma position », comme dans une appli de cartes. */
function Commandes({ fond, setFond, moi }: { fond: 'satellite' | 'plan'; setFond: (f: 'satellite' | 'plan') => void; moi: PointTrajet | null }) {
  const map = useMap()
  return (
    <div className="carte-commandes">
      <button type="button" className="carte-bouton carte-fond" onClick={() => setFond(fond === 'satellite' ? 'plan' : 'satellite')}>
        {fond === 'satellite' ? <BorderOuterOutlined /> : <GlobalOutlined />}
        <span>{fond === 'satellite' ? 'Plan' : 'Satellite'}</span>
      </button>
      {moi && <button type="button" className="carte-bouton" aria-label="Ma position" onClick={() => map.flyTo([moi.lat, moi.lng], 15)}><AimOutlined /></button>}
      <div className="carte-zoom">
        <button type="button" aria-label="Zoomer" onClick={() => map.zoomIn()}><PlusOutlined /></button>
        <button type="button" aria-label="Dézoomer" onClick={() => map.zoomOut()}><MinusOutlined /></button>
      </div>
    </div>
  )
}

function Verdict({ trajet }: { trajet: TrajetVolta }) {
  const arrets = trajet.etapes.filter((e) => e.type === 'recharge').length
  const titre = trajet.verdict === 'batterie_suffit' ? 'Votre batterie suffit' : trajet.verdict === 'recharge_necessaire' ? `Il faut recharger ${arrets === 1 ? 'une fois' : `${arrets} fois`}` : 'Trajet impossible pour le moment'
  const texte = trajet.verdict === 'batterie_suffit'
    ? `Vous arrivez à ${trajet.arrivee} sans vous arrêter.`
    : trajet.verdict === 'recharge_necessaire' ? `Volta a trouvé ${arrets === 1 ? 'la borne' : 'les bornes'} sur votre route.` : `Aucune borne ne permet d’atteindre ${trajet.bloqueA ?? trajet.arrivee} avec votre batterie.`
  return (
    <div className="trajet-verdict">
      <strong>{titre}</strong>
      <span>{texte}</span>
    </div>
  )
}

/**
 * « Trajet Volta » sur le web, identique à l'application : départ depuis ma position,
 * destination choisie en touchant la carte ou par adresse, itinéraire vers une borne,
 * arrêts recharge calculés, guidage pas à pas.
 */
export default function EspaceTrajet() {
  const [fond, setFond] = useState<'satellite' | 'plan'>('satellite')
  const [moi, setMoi] = useState<PointTrajet | null>(null)
  const [destination, setDestination] = useState<PointTrajet | null>(null)
  const [epingle, setEpingle] = useState<(LieuTrouve & { enCours?: boolean }) | null>(null)
  const [recherche, setRecherche] = useState('')
  const [lieux, setLieux] = useState<LieuTrouve[]>([])
  const [batterie, setBatterie] = useState<number | null>(null)
  const [arrets, setArrets] = useState<number[]>([])
  const [trajet, setTrajet] = useState<TrajetVolta | null>(null)
  const [calcul, setCalcul] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { data: bornes = [] } = useQuery({ queryKey: ['espace', 'bornes'], queryFn: espace.bornes })
  const [params] = useSearchParams()
  const conduite = useConduite(trajet)

  // « Y aller » depuis l'aperçu d'une borne : itinéraire direct vers elle.
  useEffect(() => {
    const b = bornes.find((x) => String(x.id) === params.get('borne'))
    if (b) setDestination({ nom: b.nom, lat: b.latitude, lng: b.longitude })
  }, [bornes, params])

  // Ville choisie depuis la carte « Trajet Volta » de l'accueil.
  useEffect(() => {
    const lat = Number(params.get('lat'))
    const lng = Number(params.get('lng'))
    if (params.get('nom') && Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) setDestination({ nom: params.get('nom')!, lat, lng })
  }, [params])

  // Position du navigateur (repli : Tunis).
  useEffect(() => {
    if (!navigator.geolocation) {
      setMoi(TUNIS)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setMoi({ nom: 'Ma position', lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setMoi(TUNIS),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }, [])

  useEffect(() => {
    const q = recherche.trim()
    if (q.length < 2) {
      setLieux([])
      return
    }
    const t = setTimeout(() => espace.lieux(q).then(setLieux).catch(() => setLieux([])), 350)
    return () => clearTimeout(t)
  }, [recherche])

  useEffect(() => {
    if (!moi || !destination) return
    let actif = true
    setCalcul(true)
    setErreur(null)
    espace
      .trajet(moi, destination, batterie, arrets)
      .then((r) => {
        if (!actif) return
        setTrajet(r)
        if (batterie == null && r.etapes[0]?.type === 'depart') setBatterie(r.etapes[0].batterie)
      })
      .catch((e) => actif && setErreur(errorMessage(e)))
      .finally(() => actif && setCalcul(false))
    return () => {
      actif = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moi, destination, arrets, batterie])

  const allerA = (p: PointTrajet) => {
    setEpingle(null)
    setArrets([])
    setRecherche('')
    setDestination(p)
  }
  const toucher = (lat: number, lng: number) => {
    if (destination) return
    setEpingle({ nom: 'Recherche de l’adresse…', detail: '', lat, lng, enCours: true })
    espace.lieuAuPoint(lat, lng).then((l) => setEpingle(l)).catch(() => setEpingle({ nom: 'Point sur la carte', detail: '', lat, lng }))
  }

  const numeros = useMemo(() => (trajet?.etapes ?? []).flatMap((e) => (e.type === 'recharge' ? [e.borneId] : [])), [trajet])
  const points = useMemo<[number, number][]>(
    () => (trajet?.trace.length ? trajet.trace : [...(moi ? [[moi.lat, moi.lng] as [number, number]] : []), ...(destination ? [[destination.lat, destination.lng] as [number, number]] : [])]),
    [trajet, moi, destination],
  )
  const reseau = bornes.filter((b: Borne) => b.source !== 'publique')

  const [replie, setReplie] = useState(false)
  const arretsTrajet = (trajet?.etapes ?? []).filter((e) => e.type === 'recharge').length

  return (
    <div className={`trajet-web${conduite.actif ? ' en-conduite' : ''}`}>
      <div className="trajet-carte">
        <MapContainer center={[35.6, 10.1]} zoom={7} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          {FONDS[fond].map((t) => <TileLayer key={t.url} url={t.url} attribution={t.attribution} maxZoom={19} />)}
          <SurClic onClic={toucher} />
          {!conduite.actif && <Cadrage points={points} />}
          <VoitureSurCarte conduite={conduite} />
          <Commandes fond={fond} setFond={setFond} moi={moi} />
          {trajet && trajet.trace.length > 1 && !conduite.actif && (
            <>
              <Polyline positions={trajet.trace} pathOptions={{ color: '#FFFFFF', weight: 9, opacity: 0.9 }} />
              <Polyline positions={trajet.trace} pathOptions={{ color: '#E5545F', weight: 5 }} />
            </>
          )}
          {moi && !conduite.actif && <Marker position={[moi.lat, moi.lng]} icon={ICONE_MOI} />}
          {destination && <Marker position={[destination.lat, destination.lng]} icon={ICONE_EPINGLE} />}
          {epingle && !destination && <Marker position={[epingle.lat, epingle.lng]} icon={ICONE_EPINGLE} />}
          {reseau.filter((b) => !conduite.actif || numeros.includes(b.id)).map((b) => {
            const n = numeros.indexOf(b.id)
            return (
              <Marker key={b.id} position={[b.latitude, b.longitude]} icon={iconeBorne(n >= 0 ? n + 1 : null, !!trajet)}>
                <Popup>
                  <strong>{b.nom}</strong><br />
                  <Tag style={{ marginTop: 6 }}>{b.puissanceKw} kW</Tag>
                  <Space style={{ marginTop: 8 }}>
                    <Button type="primary" size="small" onClick={() => allerA({ nom: b.nom, lat: b.latitude, lng: b.longitude })}>Itinéraire</Button>
                    {destination && <Button size="small" onClick={() => setArrets((a) => (a.includes(b.id) ? a.filter((x) => x !== b.id) : [...a, b.id]))}>{arrets.includes(b.id) ? 'Retirer l’arrêt' : 'Arrêt en route'}</Button>}
                  </Space>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>

        {/* Recherche, en haut (comme l'application) */}
        {!conduite.actif && (
          <div className="trajet-recherche verre">
            <div className="trajet-depart">
              <Link to="/espace" className="trajet-retour" aria-label="Retour"><ArrowLeftOutlined /></Link>
              <span className="trajet-point-moi" />
              <span>{moi ? (moi === TUNIS ? 'Départ : Tunis' : 'Départ : ma position') : 'Recherche de votre position…'}</span>
            </div>
            <AutoComplete
              value={recherche}
              onChange={setRecherche}
              onSelect={(_, o) => allerA((o as unknown as { lieu: LieuTrouve }).lieu)}
              options={lieux.map((l, i) => ({ value: `${l.nom}#${i}`, lieu: l, label: <span><EnvironmentOutlined /> <strong>{l.nom}</strong> <Typography.Text type="secondary">{l.detail}</Typography.Text></span> }))}
              style={{ width: '100%' }}
            >
              <Input size="large" className={`trajet-champ${destination ? " choisi" : ""}`} prefix={<SearchOutlined />} placeholder={destination ? destination.nom : 'Où voulez-vous aller ?'} allowClear />
            </AutoComplete>
          </div>
        )}

        {/* Épingle posée sur la carte : nom du lieu et « Y aller », comme dans l'application. */}
        {epingle && !destination && !conduite.actif && (
          <div className="carte-fiche">
            <EnvironmentOutlined className="carte-fiche-icone" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{epingle.nom}</strong>
              {epingle.detail && <Typography.Text type="secondary" ellipsis style={{ display: 'block' }}>{epingle.detail}</Typography.Text>}
            </div>
            <Button type="primary" size="large" disabled={epingle.enCours} onClick={() => allerA(epingle)}>Y aller</Button>
            <Button size="large" type="text" onClick={() => setEpingle(null)}>Fermer</Button>
          </div>
        )}

        {/* Fiche du trajet, en bas (comme l'application) */}
        {!conduite.actif && !(epingle && !destination) && (
          <section className={`trajet-fiche verre${replie ? ' replie' : ''}`}>
            <button type="button" className="trajet-poignee" aria-label={replie ? 'Déplier' : 'Replier'} onClick={() => setReplie((r) => !r)}><i /></button>
            {!destination ? (
              <div className="trajet-vide">
                <strong>Où voulez-vous aller ?</strong>
                <span>Touchez la carte à l’endroit voulu, cherchez une adresse, ou touchez une borne ⚡ pour y aller.</span>
              </div>
            ) : (
              <div className="trajet-fiche-contenu">
                <div className="trajet-fiche-titre">
                  <h2>Vers {destination.nom}</h2>
                  <button type="button" onClick={() => { setDestination(null); setTrajet(null); setArrets([]) }}>Changer</button>
                </div>
                <div className="trajet-batterie">
                  <ThunderboltOutlined className="trajet-batterie-icone" />
                  <div><span>Batterie au départ</span><strong>{batterie ?? '—'} %</strong></div>
                  <button type="button" aria-label="Moins" onClick={() => setBatterie((b) => Math.max(5, (b ?? 50) - 5))}><MinusOutlined /></button>
                  <button type="button" aria-label="Plus" onClick={() => setBatterie((b) => Math.min(100, (b ?? 50) + 5))}><PlusOutlined /></button>
                </div>
                {calcul ? (
                  <div className="trajet-calcul"><Spin /> Volta prépare votre trajet…</div>
                ) : erreur ? (
                  <Typography.Text type="danger">{erreur}</Typography.Text>
                ) : trajet ? (
                  <>
                    <div className="trajet-actions">
                      {trajet.possible && trajet.trace.length > 1 && (
                        <button type="button" className="trajet-demarrer" onClick={() => conduite.demarrer(moi)}><SendOutlined rotate={-45} /> Démarrer</button>
                      )}
                      <a className="trajet-plans" href={`https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=driving`} target="_blank" rel="noreferrer"><CompassOutlined /> Plans</a>
                    </div>
                    <Verdict trajet={trajet} />
                    {trajet.conseil && <div className="trajet-conseil"><InfoCircleOutlined /> {trajet.conseil}</div>}
                    <div className="trajet-chiffres">
                      <div><strong>{trajet.distanceKm} km</strong><span>Distance</span></div>
                      <div><strong>{formatDuree(trajet.minutesConduite + trajet.minutesRecharge)}</strong><span>Durée totale</span></div>
                      <div><strong>{formatMontant(trajet.coutDt, 0)}</strong><span>{arretsTrajet ? 'Prix total' : 'Sans recharge'}</span></div>
                    </div>
                    <ol className="trajet-etapes">
                      {trajet.etapes.map((e, i) => (
                        <li key={i} className={e.type}>
                          <strong>{e.type === 'depart' ? 'Départ' : e.type === 'recharge' ? `Arrêt · ${e.nom}` : `Arrivée · ${e.nom}`}</strong>
                          {e.type === 'recharge' ? (
                            <span>Après {e.km} km · rechargez {formatDuree(e.minutes)} ({e.batterieArrivee} % → {e.batterieDepart} %) · environ {formatMontant(e.prix, 0)}</span>
                          ) : (
                            <span>{e.type === 'depart' ? 'Vous partez avec' : `Après ${e.km} km, vous arrivez avec`} {e.batterie} % de batterie</span>
                          )}
                        </li>
                      ))}
                    </ol>
                    <div className="trajet-copilote"><ThunderboltOutlined /> {trajet.commentaire}</div>
                    {trajet.instructions.length > 0 && (
                      <details className="trajet-guidage">
                        <summary>Guidage pas à pas ({trajet.instructions.length} étapes)</summary>
                        <ol>{trajet.instructions.map((g, i) => <li key={i}>{g.texte} {g.distanceM > 0 && <Typography.Text type="secondary">· {g.distanceM < 1000 ? `${g.distanceM} m` : `${(g.distanceM / 1000).toFixed(1)} km`}</Typography.Text>}</li>)}</ol>
                      </details>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </section>
        )}

        <PanneauConduite conduite={conduite} />
      </div>
    </div>
  )
}
