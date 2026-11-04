// Volteo Chain : batteries tracées par NFT (BatteryPassport) et recharges certifiées (ChargeLedger).
import { api } from '../api'
import { URL_PUBLIQUE } from '../components/EtiquetteBorne'

export type StatutBatterie = 'en_attente' | 'creee' | 'activee' | 'echec'

export interface Batterie {
  id: number
  numSerie: string
  modele: string
  chimie: string | null
  capaciteKwh: number
  vin: string | null
  statut: StatutBatterie
  tokenId: number | null
  txCreation: string | null
  txTransfert: string | null
  vehiculeId: number | null
  vehicule?: string | null
  proprietaire?: string | null
  activeeLe: string | null
  erreur: string | null
  creeeLe: string | null
  codeActivation?: string
  passeport?: Passeport | null
}

export interface RechargeCertifiee {
  sessionId: string
  borne: string
  energieKWh: number
  debut: string
  fin: string
  station: string
  nomStation: string
}

export interface Passeport {
  contrat: string
  tokenId: number
  proprietaire: string
  numSerie: string
  modele: string
  chimie: string
  capaciteKWh: number
  vin: string
  soh: number
  energieTotaleKWh: number
  nbRecharges: number
  cycles: number
  recyclee: boolean
  fabricant: string
  dateFabrication: string
  interventions: { type: string; description: string; garage: string; date: string }[]
  recharges: RechargeCertifiee[]
}

export const STATUT_BATTERIE: Record<StatutBatterie, { label: string; couleur: string }> = {
  en_attente: { label: 'En attente', couleur: 'default' },
  creee: { label: 'NFT créé', couleur: 'processing' },
  activee: { label: 'Activée par le client', couleur: 'success' },
  echec: { label: 'Échec blockchain', couleur: 'error' },
}

/** Lien du QR code collé sur la batterie : le passeport public, lisible par tout acheteur. */
export const lienQrBatterie = (numSerie: string) => `${URL_PUBLIQUE}/batterie/${encodeURIComponent(numSerie)}`

export const adresseCourte = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—')

// --- Fabricant ---
export const fabricant = {
  liste: (q?: string) => api.get<{ data: Batterie[]; blockchain: boolean }>('/fabricant/batteries', { params: { q } }).then((r) => r.data),
  creer: (b: { numSerie: string; modele: string; chimie?: string; capaciteKwh: number; vin?: string }) =>
    api.post<Batterie>('/fabricant/batteries', b).then((r) => r.data),
  detail: (id: number) => api.get<{ data: Batterie; passeport: Passeport | null }>(`/fabricant/batteries/${id}`).then((r) => r.data),
  reessayer: (id: number) => api.post<Batterie>(`/fabricant/batteries/${id}/reessayer`).then((r) => r.data),
}

// --- Conducteur ---
export const conducteur = {
  batteries: () => api.get<{ data: Batterie[]; blockchain: boolean }>('/batteries').then((r) => r.data),
  activer: (b: { numSerie?: string; vin?: string; code: string; vehiculeId: number }) =>
    api.post<{ data: Batterie; passeport: Passeport | null }>('/batteries/activer', b).then((r) => r.data),
  ceder: (id: number, email: string) => api.post<{ message: string }>(`/batteries/${id}/ceder`, { email }).then((r) => r.data),
}

// --- Public ---
export const passeportPublic = (numSerie: string) =>
  api.get<{ data: Passeport }>(`/batteries/${encodeURIComponent(numSerie)}/passeport`).then((r) => r.data.data)
