import { useState } from 'react'
import { EnvironmentOutlined, HeartFilled, ThunderboltFilled, ApiOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import type { Borne, Connecteur, EtatBorne } from '../types'

export const NOM_PRISE: Record<string, string> = { CCS: 'CCS', Type2: 'Type 2', CHAdeMO: 'CHAdeMO', AC: 'AC', DC: 'DC' }
export const UNITE_TARIF = { kwh: 'kWh', minute: 'min', heure: 'h', puissance: 'kW·h' } as const

const LIBELLE_ETAT: Partial<Record<EtatBorne, string>> = {
  disponible: 'Disponible', occupee: 'En charge', maintenance: 'Maintenance', hors_service: 'Hors service', defaut: 'En défaut', deconnectee: 'Hors ligne',
}
/** Pastille d'état sur fond sombre, comme l'EtatBadge de l'application. */
export function EtatPastille({ etat }: { etat: EtatBorne }) {
  return <span className={`etat-pastille ${etat}`}><i />{LIBELLE_ETAT[etat] ?? 'Indisponible'}</span>
}

/** Une borne refuse-t-elle les recharges (hors service, défaut, déconnectée, maintenance) ? */
export const borneIndisponible = (b: Borne) => ['hors_service', 'defaut', 'deconnectee', 'maintenance', 'indisponible'].includes(b.etat)

export function regrouperPrises(connecteurs: Connecteur[], indispo: boolean) {
  const groupes = new Map<string, { type: string; total: number; libres: number }>()
  for (const c of connecteurs ?? []) {
    const g = groupes.get(c.type) ?? { type: c.type, total: 0, libres: 0 }
    g.total += 1
    if (c.etat === 'disponible' && !indispo) g.libres += 1
    groupes.set(c.type, g)
  }
  return [...groupes.values()]
}

/** Photo réelle de la borne (crédit de la licence), sinon visuel de nuit. */
export function PhotoBorne({ borne, hauteur, className = '' }: { borne: Borne; hauteur: number | string; className?: string }) {
  const [erreur, setErreur] = useState(false)
  const photo = borne.photoUrl && !erreur ? borne.photoUrl : null
  return (
    <div className={`photo-borne ${className}`} style={{ height: hauteur }}>
      {photo ? <img src={photo} alt="" loading="lazy" onError={() => setErreur(true)} /> : <div className="photo-borne-nuit"><ThunderboltFilled /></div>}
      <span className="photo-borne-fondu" />
      {photo && borne.photoCredit && <span className="photo-borne-credit">© {borne.photoCredit.split(' · ')[0]}</span>}
    </div>
  )
}

/** Carte d'une borne : identique à la BorneCard de l'application mobile. */
export default function CarteBorneClient({ borne, favori = false }: { borne: Borne; favori?: boolean }) {
  const publique = borne.source === 'publique'
  const rapide = (borne.puissanceKw ?? 0) >= 50
  const groupes = regrouperPrises(borne.connecteurs, borneIndisponible(borne))
  const tarif = !publique ? borne.tarifApplique ?? { prix: borne.tarifKwh, mode: 'kwh' as const } : null

  return (
    <Link to={`/espace/bornes/${borne.id}`} className="carte-borne-client" aria-label={`Ouvrir ${borne.nom}`}>
      <PhotoBorne borne={borne} hauteur={160} />
      <div className="carte-borne-client-pastilles">
        <EtatPastille etat={borne.etat} />
        <span style={{ flex: 1 }} />
        {favori && <span className="pastille-verre rond"><HeartFilled /></span>}
        <span className="pastille-verre">{rapide ? <ThunderboltFilled className="rouge" /> : <ApiOutlined />} {borne.puissanceKw ?? '—'} kW</span>
      </div>
      <div className="carte-borne-client-corps">
        <span className={`carte-borne-client-type${publique ? ' publique' : ''}`}>{publique ? (borne.operateur ?? 'Autre opérateur') : rapide ? 'Charge rapide' : 'Charge normale'}</span>
        <strong>{borne.nom}</strong>
        <span className="carte-borne-client-adresse"><EnvironmentOutlined /> {borne.adresse}</span>
        {(groupes.length > 0 || tarif) && (
          <div className="carte-borne-client-bas">
            <div className="carte-borne-client-prises">
              {groupes.map((g) => (
                <span key={g.type} className="prise-pastille">
                  {NOM_PRISE[g.type] ?? g.type}
                  {!publique && <b className={g.libres > 0 ? 'libre' : ''}>{g.libres}/{g.total}</b>}
                </span>
              ))}
            </div>
            {tarif && <span className="carte-borne-client-tarif">{tarif.prix.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} <small>DT/{UNITE_TARIF[tarif.mode]}</small></span>}
          </div>
        )}
      </div>
    </Link>
  )
}
