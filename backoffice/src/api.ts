import axios, { AxiosError } from 'axios'
import type { LieuTrouve, PointTrajet, ReponseVolta, TrajetVolta, MaStation, MessageStation, MoyenPaiement, TransactionEnLigne, ContexteSimulateur, EtatSimulateur, Station, StationDetail, StationsVue,
  AdminUser,
  Abonnement,
  Alerte,
  Badge,
  Borne,
  BorneDetail,
  BorneInput,
  CommandeOcpp,
  Connecteur,
  Deploiement,
  DocumentItem,
  EntreeHistorique,
  EvenementBadge,
  EvenementHistorique,
  Facture,
  FactureClient,
  Firmware,
  LoginResponse,
  Maintenance,
  MaintenanceInput,
  MatricePermissions,
  Mesure,
  Module,
  Niveau,
  NotificationEnvoyee,
  PageAudit,
  Paginated,
  Paiement,
  Panne,
  Parametres,
  Plateforme,
  Rapport,
  ResumePaiements,
  Role,
  Series,
  Session,
  SessionClient,
  Souscription,
  Stats,
  StatsClient,
  Supervision,
  Tarif,
  TopBorne,
  TypeRapport,
  User,
  UserDetail,
  UserOption,
  Vehicule,
} from './types'

const TOKEN_KEY = 'borneapp_token'
const USER_KEY = 'borneapp_user'

function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}

export function getToken(): string | null {
  return lire(TOKEN_KEY)
}

export function getStoredUser(): User | null {
  const raw = lire(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

export function storeAuth(token: string, user: User): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // Stockage indisponible (navigation privée) : la session reste en mémoire.
  }
}

export function storeUser(user: User): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // ignoré
  }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {
    // ignoré
  }
}

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let onUnauthorized: (() => void) | null = null

export function setOnUnauthorized(handler: () => void): void {
  onUnauthorized = handler
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/login')) {
      clearAuth()
      onUnauthorized?.()
    }
    return Promise.reject(error)
  },
)

/** Extrait un message d'erreur lisible d'une erreur axios (validation Laravel incluse). */
export function errorMessage(error: unknown, fallback = 'Erreur réseau'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined
    const premiere = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
    if (premiere) return premiere
    if (data?.message) return data.message
    if (error.response) return `Erreur ${error.response.status}`
  }
  return fallback
}

const get = async <T>(url: string, params?: object): Promise<T> => (await api.get<T>(url, { params })).data
const post = async <T>(url: string, body?: unknown): Promise<T> => (await api.post<T>(url, body)).data
const put = async <T>(url: string, body?: unknown): Promise<T> => (await api.put<T>(url, body)).data
const del = async <T>(url: string): Promise<T> => (await api.delete<T>(url)).data

/** Nettoie un objet de filtres (supprime vides / undefined). */
export function filtres(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  )
}

/** Télécharge un fichier protégé (PDF, Excel, CSV…) en conservant le nom donné par le serveur. */
export async function telecharger(url: string, params?: object, nomParDefaut = 'export'): Promise<void> {
  const reponse = await api.get(url, { params, responseType: 'blob' })
  const disposition = String(reponse.headers['content-disposition'] ?? '')
  const nom = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1] ?? nomParDefaut
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(reponse.data as Blob)
  lien.download = decodeURIComponent(nom)
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000)
}

/** Récupère un fichier protégé sous forme d'URL locale (aperçu d'image / PDF). */
export async function urlLocale(url: string): Promise<string> {
  const reponse = await api.get(url, { params: { inline: 1 }, responseType: 'blob' })
  return URL.createObjectURL(reponse.data as Blob)
}

function formulaire(champs: Record<string, string | number | Blob | null | undefined>): FormData {
  const fd = new FormData()
  for (const [cle, valeur] of Object.entries(champs)) {
    if (valeur !== undefined && valeur !== null && valeur !== '') fd.append(cle, valeur as string | Blob)
  }
  return fd
}

// --- Authentification & profil ---

export const fetchPlateforme = () => get<Plateforme>('/plateforme')
export const login = (email: string, password: string) => post<LoginResponse>('/auth/login', { email, password })
export const verifier2fa = (email: string, code: string) => post<LoginResponse>('/auth/2fa/verify', { email, code })
export const motDePasseOublie = (email: string) => post<{ message: string }>('/auth/forgot', { email })
export const reinitialiserMotDePasse = (email: string, code: string, password: string) =>
  post<{ message: string }>('/auth/reset', { email, code, password })
export const inscrire = (input: { nom: string; prenom: string; email: string; telephone?: string; password: string }) =>
  post<LoginResponse>('/auth/register', input)
export const connexionGoogle = (idToken: string) => post<LoginResponse>('/auth/google', { id_token: idToken })
export const logout = () => post('/auth/logout')
export const fetchMe = () => get<User>('/auth/me')
export const updateProfil = (input: Partial<User> & { motDePasseActuel?: string; nouveauMotDePasse?: string }) =>
  put<User>('/auth/profil', input)
export const setDeuxFacteurs = (actif: boolean) => put<User>('/auth/2fa', { actif })

// --- Tableau de bord & supervision ---

export const fetchStats = () => get<Stats>('/admin/stats')
export const fetchSeries = (jours = 14) => get<Series>('/admin/stats/series', { jours })
export const fetchTopBornes = () => get<TopBorne[]>('/admin/stats/top-bornes')
export const fetchSupervision = () => get<Supervision>('/admin/supervision')

// --- Bornes & connecteurs ---

export const fetchBornes = (params: Record<string, unknown> = {}) => get<Borne[]>('/admin/bornes', filtres(params))
export const fetchBorne = (id: number) => get<BorneDetail>(`/admin/bornes/${id}`)
export const fetchHistoriqueBorne = (id: number) => get<EvenementHistorique[]>(`/admin/bornes/${id}/historique`)
export const createBorne = (input: BorneInput) => post<Borne>('/admin/bornes', input)
export const updateBorne = (id: number, input: Partial<BorneInput>) => put<Borne>(`/admin/bornes/${id}`, input)
export const desactiverBorne = (id: number) => del<{ message: string }>(`/admin/bornes/${id}`)
export const reactiverBorne = (id: number) => post<{ message: string }>(`/admin/bornes/${id}/reactiver`)
/** Nouveau mot de passe OCPP (Security Profile 1), renvoyé une seule fois. */
export const genererMotDePasseOcpp = (id: number) =>
  post<{ identifiant: string; motDePasse: string; url: string }>(`/admin/bornes/${id}/mot-de-passe-ocpp`)
export const commandeBorne = (
  id: number,
  commande: CommandeOcpp,
  options: { connecteurId?: number; cle?: string; valeur?: string } = {},
) => post<{ message: string; donnees: { key: string; value: string; readonly: boolean }[] | null }>(
  `/admin/bornes/${id}/commande`,
  { commande, ...options },
)
export const createConnecteur = (borneId: number, input: { type: string; puissanceKw: number }) =>
  post<Connecteur>(`/admin/bornes/${borneId}/connecteurs`, input)
export const updateConnecteur = (id: number, input: Partial<{ type: string; puissanceKw: number; etat: string }>) =>
  put<Connecteur>(`/admin/connecteurs/${id}`, input)
export const deleteConnecteur = (id: number) => del<{ message: string }>(`/admin/connecteurs/${id}`)

// --- Sessions ---

export const fetchSessions = (params: Record<string, unknown>) =>
  get<Paginated<Session>>('/admin/sessions', filtres(params))
export const fetchSession = (id: number) => get<{ session: Session; mesures: Mesure[] }>(`/admin/sessions/${id}`)
export const createSession = (input: { userId: number; borneId: number; connecteurId: number; vehiculeId?: number }) =>
  post<Session>('/admin/sessions', input)
export const actionSession = (id: number, action: 'pause' | 'reprendre' | 'terminer') =>
  post<{ message?: string }>(`/admin/sessions/${id}/${action}`)
export const annulerSession = (id: number, motif: string) => post<Session>(`/admin/sessions/${id}/annuler`, { motif })

// --- Utilisateurs ---

export const fetchUsers = (params: Record<string, unknown> = {}) => get<AdminUser[]>('/admin/users', filtres(params))
export const fetchUserOptions = (role?: string) => get<UserOption[]>('/admin/utilisateurs/options', filtres({ role }))
export const fetchUser = (id: number) => get<UserDetail>(`/admin/users/${id}`)
export const fetchHistoriqueUser = (id: number) => get<EntreeHistorique[]>(`/admin/users/${id}/historique`)
export const createUser = (input: Partial<AdminUser> & { password?: string }) => post<AdminUser>('/admin/users', input)
export const updateUser = (id: number, input: Partial<AdminUser> & { password?: string }) =>
  put<AdminUser>(`/admin/users/${id}`, input)
export const regenererQr = (id: number) => post<AdminUser>(`/admin/users/${id}/qr`)
export const attribuerAbonnement = (id: number, abonnementId: number, offert: boolean) =>
  post<Souscription>(`/admin/users/${id}/souscriptions`, { abonnementId, offert })
export const resilierSouscription = (id: number) => post(`/admin/souscriptions/${id}/resilier`)
export const ajusterWallet = (id: number, montant: number, motif: string) =>
  post<{ soldeWallet: number }>(`/admin/users/${id}/wallet`, { montant, motif })

// --- Badges RFID ---

export const fetchBadges = (params: Record<string, unknown> = {}) => get<Badge[]>('/admin/badges', filtres(params))
export const createBadge = (input: { uid: string; libelle?: string; userId?: number | null; dateExpiration?: string | null }) =>
  post<Badge>('/admin/badges', input)
export const updateBadge = (
  id: number,
  input: { libelle?: string | null; userId?: number | null; dateExpiration?: string | null; actif?: boolean },
) => put<Badge>(`/admin/badges/${id}`, input)
export const bloquerBadge = (id: number, motif: string) => post<Badge>(`/admin/badges/${id}/bloquer`, { motif })
export const debloquerBadge = (id: number) => post<Badge>(`/admin/badges/${id}/debloquer`)
export const fetchHistoriqueBadge = (id: number) => get<EvenementBadge[]>(`/admin/badges/${id}/historique`)

// --- Véhicules ---

export const fetchVehicules = (params: Record<string, unknown> = {}) =>
  get<Vehicule[]>('/admin/vehicules', filtres(params))
export const createVehicule = (input: Omit<Vehicule, 'id' | 'userNom'>) => post<Vehicule>('/admin/vehicules', input)
export const updateVehicule = (id: number, input: Partial<Vehicule>) => put<Vehicule>(`/admin/vehicules/${id}`, input)
export const deleteVehicule = (id: number) => del(`/admin/vehicules/${id}`)
export const fetchSessionsVehicule = (id: number) => get<Session[]>(`/admin/vehicules/${id}/sessions`)

// --- Paiements & factures ---

export const fetchPaiements = (params: Record<string, unknown>) =>
  get<Paginated<Paiement>>('/admin/paiements', filtres(params))
export const fetchResumePaiements = (params: Record<string, unknown>) =>
  get<ResumePaiements>('/admin/paiements/resume', filtres(params))
export const rembourser = (id: number, montant: number, motif: string) =>
  post<Paiement>(`/admin/paiements/${id}/rembourser`, { montant, motif })
export const regulariser = (id: number, methode: string) => post<Paiement>(`/admin/paiements/${id}/regulariser`, { methode })
export const fetchFactures = (params: Record<string, unknown>) => get<Paginated<Facture>>('/admin/factures', filtres(params))

// --- Tarification & abonnements ---

export const fetchTarifs = () => get<Tarif[]>('/admin/tarifs')
export const saveTarif = (input: Partial<Tarif>, id?: number) =>
  id ? put<Tarif>(`/admin/tarifs/${id}`, input) : post<Tarif>('/admin/tarifs', input)
export const archiverTarif = (id: number) => del<{ message: string }>(`/admin/tarifs/${id}`)
export const affecterTarif = (id: number, borneIds: number[], special: boolean) =>
  post<{ message: string }>(`/admin/tarifs/${id}/affecter`, { borneIds, special })
export const simulerTarif = (input: {
  tarifId: number
  energieKwh: number
  dureeMinutes: number
  puissanceKw: number
  heureDebut: string
  remisePourcent?: number
}) => post<{ heuresCreuses: boolean; prixUnitaire: number; prixBrut: number; prix: number }>('/admin/tarifs/simuler', input)
export const fetchAbonnements = () => get<Abonnement[]>('/admin/abonnements')
export const saveAbonnement = (input: Partial<Abonnement>, id?: number) =>
  id ? put<Abonnement>(`/admin/abonnements/${id}`, input) : post<Abonnement>('/admin/abonnements', input)
export const fetchSouscriptions = (params: Record<string, unknown> = {}) =>
  get<Souscription[]>('/admin/souscriptions', filtres(params))

// --- Maintenance & pannes ---

export const fetchMaintenances = (params: Record<string, unknown> = {}) =>
  get<Maintenance[]>('/admin/maintenances', filtres(params))
export const fetchMaintenance = (id: number) => get<Maintenance>(`/admin/maintenances/${id}`)
export const createMaintenance = (input: MaintenanceInput) => post<Maintenance>('/admin/maintenances', input)
export const updateMaintenance = (id: number, input: Partial<MaintenanceInput>) =>
  put<Maintenance>(`/admin/maintenances/${id}`, input)
export const deleteMaintenance = (id: number) => del(`/admin/maintenances/${id}`)
export const ajouterPiece = (
  id: number,
  input: { designation: string; reference?: string; quantite: number; coutUnitaire: number },
) => post<Maintenance>(`/admin/maintenances/${id}/pieces`, input)
export const supprimerPiece = (id: number) => del(`/admin/maintenance-pieces/${id}`)
export const ajouterIntervention = (
  id: number,
  input: { technicienId?: number; debut: string; fin?: string | null; description: string },
) => post<Maintenance>(`/admin/maintenances/${id}/interventions`, input)
export const supprimerIntervention = (id: number) => del(`/admin/maintenance-interventions/${id}`)
export const ajouterCommentaire = (id: number, contenu: string) =>
  post<Maintenance>(`/admin/maintenances/${id}/commentaires`, { contenu })
export const ajouterPhoto = (id: number, fichier: File, legende?: string) =>
  post<DocumentItem>(`/admin/maintenances/${id}/photos`, formulaire({ fichier, legende }))
export const fetchPannes = (params: Record<string, unknown> = {}) => get<Panne[]>('/admin/pannes', filtres(params))
export const createPanne = (input: {
  borneId: number
  connecteurId?: number | null
  alerteId?: number | null
  type: string
  gravite: string
  description: string
}) => post<Panne>('/admin/pannes', input)
export const updatePanne = (id: number, input: Partial<Pick<Panne, 'statut' | 'gravite' | 'description'>>) =>
  put<Panne>(`/admin/pannes/${id}`, input)

// --- Alertes & notifications ---

export const fetchAlertes = (params: Record<string, unknown> = {}) => get<Alerte[]>('/admin/alertes', filtres(params))
export const prendreEnCharge = (id: number) => put<Alerte>(`/admin/alertes/${id}/prendre-en-charge`)
export const resoudreAlerte = (id: number) => put(`/admin/alertes/${id}/resoudre`)
export const fetchNotifications = (params: Record<string, unknown> = {}) =>
  get<NotificationEnvoyee[]>('/admin/notifications', filtres(params))
export const testerNotification = (canal: string, destinataire?: string) =>
  post<{ message: string; statut: string }>('/admin/notifications/test', { canal, destinataire })

// --- Firmware ---

export const fetchFirmwares = () => get<Firmware[]>('/admin/firmwares')
export const televerserFirmware = (input: {
  fichier: File
  version: string
  fabricant?: string
  modele?: string
  notes?: string
}) => post<Firmware>('/admin/firmwares', formulaire(input))
export const supprimerFirmware = (id: number) => del(`/admin/firmwares/${id}`)
export const deployerFirmware = (id: number, borneIds: number[]) =>
  post<{ message: string; resultats: { borneId: number; ok: boolean; message: string }[] }>(
    `/admin/firmwares/${id}/deployer`,
    { borneIds },
  )
export const fetchDeploiements = (params: Record<string, unknown> = {}) =>
  get<Deploiement[]>('/admin/deploiements', filtres(params))
export const rollbackFirmware = (id: number) => post<{ message: string }>(`/admin/deploiements/${id}/rollback`)

// --- Rapports ---

export const fetchRapport = (type: TypeRapport, params: Record<string, unknown>) =>
  get<Rapport>(`/admin/rapports/${type}`, filtres(params))
export const exporterRapport = (type: TypeRapport, format: string, params: Record<string, unknown>) =>
  telecharger(`/admin/rapports/${type}/export`, filtres({ ...params, format }), `rapport.${format}`)

// --- Documents ---

export const fetchDocuments = (params: Record<string, unknown> = {}) =>
  get<DocumentItem[]>('/admin/documents', filtres(params))
export const televerserDocument = (input: {
  fichier: File
  type: string
  titre: string
  borneId?: number | null
  dateExpiration?: string | null
}) => post<DocumentItem>('/admin/documents', formulaire(input))
export const supprimerDocument = (id: number) => del(`/admin/documents/${id}`)
export const telechargerDocument = (doc: DocumentItem) =>
  telecharger(`/admin/documents/${doc.id}/telecharger`, undefined, doc.nomFichier)

// --- Paramétrage & permissions ---

export const fetchParametres = () => get<Parametres>('/admin/parametres')
export const updateParametres = (input: Partial<Parametres>) => put<Parametres>('/admin/parametres', input)
export const televerserPhotoBorne = (id: number, photo: File) => post<Borne>(`/admin/bornes/${id}/photo`, formulaire({ photo }))
export const supprimerPhotoBorne = (id: number) => del<Borne>(`/admin/bornes/${id}/photo`)
export const televerserLogo = (logo: File) => post<{ logoUrl: string }>('/admin/parametres/logo', formulaire({ logo }))
export const fetchPermissions = () => get<MatricePermissions>('/admin/permissions')
export const updatePermissions = (matrice: Record<Role, Record<Module, Niveau>>) =>
  put<MatricePermissions>('/admin/permissions', { matrice })

// --- Audit ---

export const fetchAudit = (params: Record<string, unknown>) => get<PageAudit>('/admin/audit', filtres(params))
export const exporterAudit = (format: string, params: Record<string, unknown>) =>
  telecharger('/admin/audit/export', filtres({ ...params, format }), `audit.${format}`)

// --- Factures (PDF) ---

export const telechargerFacture = (id: number, numero: string, admin = true) =>
  telecharger(admin ? `/admin/factures/${id}/pdf` : `/factures/${id}/pdf`, undefined, `${numero}.pdf`)

// --- Espace client ---

export const espace = {
  bornes: () => get<Borne[]>('/bornes'),
  borne: (referenceOuId: string | number) => get<Borne>(`/bornes/${encodeURIComponent(String(referenceOuId))}`),
  statistiques: () => get<StatsClient>('/stats/client'),
  sessions: () => get<SessionClient[]>('/sessions'),
  sessionActive: () => get<SessionClient | null>('/sessions/active'),
  demarrer: (borneId: number, connecteurId: number, vehiculeId?: number) =>
    post<SessionClient>('/sessions', { borne_id: borneId, connecteur_id: connecteurId, vehicule_id: vehiculeId }),
  arreter: (id: number) => post<SessionClient>(`/sessions/${id}/stop`),
  mesures: (id: number) => get<Mesure[]>(`/sessions/${id}/mesures`),
  vehicules: () => get<Vehicule[]>('/vehicules'),
  saveVehicule: (input: Partial<Vehicule>, id?: number) =>
    id ? put<Vehicule>(`/vehicules/${id}`, input) : post<Vehicule>('/vehicules', input),
  deleteVehicule: (id: number) => del(`/vehicules/${id}`),
  badges: () => get<Badge[]>('/badges'),
  bloquerBadge: (id: number) => post<Badge>(`/badges/${id}/bloquer`),
  factures: () => get<FactureClient[]>('/factures'),
  paiements: () => get<Paiement[]>('/wallet/paiements'),
  recharger: (montant: number) => post<{ soldeWallet: number }>('/wallet/topup', { montant }),
  regler: (id: number, methode: 'wallet' | 'carte') =>
    post<{ message: string; soldeWallet: number }>(`/paiements/${id}/regler`, { methode }),
  abonnements: () => get<Abonnement[]>('/abonnements'),
  // Simulateur de recharge au badge
  simulateur: () => get<ContexteSimulateur>('/simulateur'),
  etatSimulateur: (borneId: number) => get<EtatSimulateur>(`/simulateur/${borneId}`),
  actionSimulateur: (borneId: number, action: 'badge' | 'brancher' | 'demarrer' | 'arreter', input: { badge_id?: number; connecteur?: number } = {}) =>
    post<{ ok: boolean; message: string; autorisation: string | null }>(`/simulateur/${borneId}/${action}`, input),
  modelesVehicules: () => get<{ cle: string; marque: string; modele: string; capaciteBatterieKwh: number; typeConnecteur: string; photoUrl: string; photoCredit: string }[]>('/vehicules/modeles'),
  // Paiement en ligne tunisien : carte bancaire, Flouci, e-DINAR / D17
  moyensPaiement: () => get<{ moyens: { moyen: MoyenPaiement; libelle: string; passerelle: string }[]; modeTest: boolean }>('/paiements/moyens'),
  payerEnLigne: (input: { objet: 'recharge_wallet' | 'reglement' | 'abonnement'; moyen: MoyenPaiement; montant?: number; paiement_id?: number; abonnement_id?: number }) =>
    post<TransactionEnLigne>('/paiements/en-ligne', { ...input, canal: 'web' }),
  transactionEnLigne: (reference: string) => get<TransactionEnLigne & { soldeWallet: number }>(`/paiements/en-ligne/${reference}`),
  souscription: () => get<Souscription | null>('/souscription'),
  souscrire: (abonnementId: number, methode: 'wallet' | 'carte') =>
    post<Souscription>('/souscriptions', { abonnement_id: abonnementId, methode }),
  resilier: () => post<{ message: string }>('/souscription/resilier'),
  // Trajet Volta (mêmes services que l'application mobile)
  trajet: (depart: PointTrajet, arrivee: PointTrajet, batterie?: number | null, arrets: number[] = []) =>
    post<TrajetVolta>('/assistant/trajet', { depart, arrivee, batterie: batterie ?? undefined, arrets }),
  lieux: (q: string) => get<LieuTrouve[]>('/assistant/lieux', { q }),
  villes: () => get<{ cle: string; nom: string; lat: number; lng: number }[]>('/assistant/trajet/villes'),
  lieuAuPoint: (lat: number, lng: number) => get<LieuTrouve>('/assistant/lieux/point', { lat, lng }),
  // Assistant Volta
  etatVolta: () => get<{ disponible: boolean; questionsRestantes: number | null; questionsParJour: number }>('/assistant/etat'),
  poserQuestion: (question: string, conversationId?: string | null) =>
    post<ReponseVolta>('/assistant/messages', { question, conversationId: conversationId ?? undefined }),
}

// --- Plateforme multi-stations ---
export const fetchStations = () => get<StationsVue>('/admin/stations')
export const fetchStation = (id: number, annee?: number) => get<StationDetail>(`/admin/stations/${id}`, { annee })
export const creerStation = (input: Partial<Station> & { admin: { prenom: string; nom: string; email: string } }) =>
  post<Station & { acces: { email: string; motDePasse: string } }>('/admin/stations', input)
export const modifierStation = (id: number, input: Partial<Station>) => put<Station>(`/admin/stations/${id}`, input)
export const suspendreStation = (id: number, motif: string) => post<Station>(`/admin/stations/${id}/suspendre`, { motif })
export const reactiverStation = (id: number) => post<Station>(`/admin/stations/${id}/reactiver`)
export const affecterBornesStation = (id: number, borneIds: number[]) => post<{ message: string }>(`/admin/stations/${id}/bornes`, { borneIds })
export const payerReversement = (id: number, periode: string, reference?: string) =>
  post<{ message: string }>(`/admin/stations/${id}/reversements`, { periode, reference })
export const fetchMaStation = (annee?: number) => get<MaStation>('/admin/ma-station', { annee })
// Messagerie plateforme ↔ station
export const messagesMaStation = () => get<MessageStation[]>('/admin/ma-station/messages')
export const ecrireAPlateforme = (contenu: string, categorie: 'message' | 'demande' = 'message') =>
  post<MessageStation>('/admin/ma-station/messages', { contenu, categorie })
export const nouveauMotDePassePersonnel = (stationId: number, userId: number) =>
  post<{ email: string; motDePasse: string }>(`/admin/stations/${stationId}/personnel/${userId}/mot-de-passe`)
export const messagesStation = (id: number) => get<MessageStation[]>(`/admin/stations/${id}/messages`)
export const repondreStation = (id: number, contenu: string) => post<MessageStation>(`/admin/stations/${id}/messages`, { contenu })
export const annoncerStations = (contenu: string) => post<{ message: string }>('/admin/stations-annonce', { contenu })
