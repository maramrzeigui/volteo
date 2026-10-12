import { useEffect, type ReactNode } from 'react'
import FondCarte from './FondCarte'
import { MapContainer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { ETAT_BORNE_HEX } from '../format'
import type { EtatBorne } from '../types'

const ECLAIR =
  '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.2 2 4.5 13.6h6.1L9.4 22l8.7-11.6H12l1.2-8.4Z"/></svg>'

export interface PointCarte {
  id: number
  latitude: number
  longitude: number
  etat?: EtatBorne | string
  libelle?: string
}

const TUNIS: [number, number] = [36.8065, 10.1815]

export function iconeBorne(etat: string | undefined, actif = false, texte?: string): L.DivIcon {
  const couleur = ETAT_BORNE_HEX[etat as EtatBorne] ?? '#8E8E99'
  const taille = actif ? 30 : 24
  return L.divIcon({
    className: '',
    html: `<div class="marqueur${actif ? ' marqueur-actif' : ''}${etat === 'occupee' ? ' marqueur-charge' : ''}" style="background:${couleur};width:${taille}px;height:${taille}px">${texte ?? ECLAIR}</div>`,
    iconSize: [taille, taille],
    iconAnchor: [taille / 2, taille / 2],
    popupAnchor: [0, -taille / 2],
  })
}

/** Ajuste la vue pour englober tous les points (une seule fois par jeu de points). */
function Cadrage({ points }: { points: PointCarte[] }) {
  const map = useMap()
  const cle = points.map((p) => p.id).join(',')
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 14)
      return
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude])), { padding: [40, 40], maxZoom: 13 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, map])
  return null
}

/** Centre la carte sur la borne sélectionnée. */
function Focus({ points, selection }: { points: PointCarte[]; selection?: number | null }) {
  const map = useMap()
  useEffect(() => {
    const p = points.find((x) => x.id === selection)
    if (p) map.flyTo([p.latitude, p.longitude], Math.max(map.getZoom(), 13), { duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, map])
  return null
}

/** Carte interactive des bornes (OpenStreetMap). */
export default function CarteBornes<T extends PointCarte>({
  points,
  hauteur = 420,
  popup,
  selection,
  onSelect,
}: {
  points: T[]
  hauteur?: number | string
  popup?: (p: T) => ReactNode
  selection?: number | null
  onSelect?: (p: T) => void
}) {
  const valides = points.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))

  return (
    <MapContainer center={TUNIS} zoom={7} scrollWheelZoom style={{ height: hauteur }} className="carte">
      <FondCarte />
      <Cadrage points={valides} />
      <Focus points={valides} selection={selection} />
      {valides.map((p) => (
        <Marker
          key={p.id}
          position={[p.latitude, p.longitude]}
          icon={iconeBorne(p.etat, selection === p.id)}
          eventHandlers={onSelect ? { click: () => onSelect(p) } : undefined}
        >
          {popup && <Popup>{popup(p)}</Popup>}
        </Marker>
      ))}
    </MapContainer>
  )
}

function Clic({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onChange(Number(e.latlng.lat.toFixed(7)), Number(e.latlng.lng.toFixed(7))) })
  return null
}

/** Sélection de coordonnées GPS par clic sur la carte (géolocalisation d'une borne). */
export function SelecteurPosition({
  latitude,
  longitude,
  onChange,
}: {
  latitude?: number
  longitude?: number
  onChange: (lat: number, lng: number) => void
}) {
  const position: [number, number] | null =
    Number.isFinite(latitude) && Number.isFinite(longitude) ? [Number(latitude), Number(longitude)] : null

  return (
    <MapContainer center={position ?? TUNIS} zoom={position ? 14 : 7} scrollWheelZoom style={{ height: 260 }} className="carte">
      <FondCarte />
      <Clic onChange={onChange} />
      {position && (
        <Marker
          position={position}
          draggable
          icon={iconeBorne('disponible', true)}
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng()
              onChange(Number(ll.lat.toFixed(7)), Number(ll.lng.toFixed(7)))
            },
          }}
        />
      )}
    </MapContainer>
  )
}
