import { useState } from 'react'
import { TileLayer } from 'react-leaflet'

/** Fonds de carte réels, comme une appli de cartes : plan en couleurs ou satellite avec les noms. */
export const FONDS_CARTE = {
  plan: [
    { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', attribution: 'Plan © Esri, HERE, Garmin, © OpenStreetMap' },
  ],
  satellite: [
    { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics' },
    { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', attribution: '' },
    { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', attribution: '' },
  ],
}
export type Fond = keyof typeof FONDS_CARTE

/** Couches de tuiles du fond choisi. */
export function Tuiles({ fond }: { fond: Fond }) {
  return <>{FONDS_CARTE[fond].map((t) => <TileLayer key={t.url} url={t.url} attribution={t.attribution} maxZoom={19} />)}</>
}

/** Fond de carte avec un bouton Plan / Satellite en haut à droite. */
export default function FondCarte({ initial = 'plan' }: { initial?: Fond }) {
  const [fond, setFond] = useState<Fond>(initial)
  return (
    <>
      <Tuiles fond={fond} />
      <div className="leaflet-top leaflet-right">
        <div className="leaflet-control">
          <button type="button" className="carte-fond-bouton" onClick={() => setFond(fond === 'plan' ? 'satellite' : 'plan')}
            style={{ backgroundImage: `url(https://server.arcgisonline.com/ArcGIS/rest/services/${fond === 'plan' ? 'World_Imagery' : 'World_Street_Map'}/MapServer/tile/6/25/34)` }}>
            <span>{fond === 'plan' ? 'Satellite' : 'Plan'}</span>
          </button>
        </div>
      </div>
    </>
  )
}
