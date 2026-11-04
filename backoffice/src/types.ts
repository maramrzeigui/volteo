// Types partagés de la plateforme web Volteo (alignés sur l'API Laravel).

export type Role =
  | 'client'
  | 'super_admin'
  | 'exploitant'
  | 'operateur'
  | 'technicien'
  | 'service_client'
  | 'finance'
  | 'fabricant'

export type Module =
  | 'dashboard'
  | 'supervision'
  | 'bornes'
  | 'sessions'
  | 'utilisateurs'
  | 'rfid'
  | 'vehicules'
  | 'paiements'
  | 'tarification'
  | 'maintenance'
  | 'alertes'
  | 'firmware'
  | 'rapports'
  | 'documents'
  | 'parametres'
  | 'audit'

export type Niveau = 'aucun' | 'lecture' | 'ecriture'

export interface Paginated<T> {
  data: T[]
  meta: { total: number; current_page: number; per_page: number }
}

// --- Authentification ---

export interface User {
  id: number
  nom: string
  prenom: string
  email: string
  telephone: string | null
  photoUrl?: string | null
  role: Role
  soldeWallet: number
  deuxFacteurs?: boolean
  qrToken?: string | null
  permissions?: Record<Module, Niveau>
  /** Station de rattachement du personnel (null : personnel de la plateforme). */
  station?: { id: number; nom: string; statut: string } | null
  /** Super-admin ou personnel Volteo : voit toutes les stations. */
  plateforme?: boolean
}

export type FormuleStation = 'essentiel' | 'pro' | 'entreprise'

export interface Station {
  id: number
  nom: string
  raisonSociale: string | null
  matriculeFiscal: string | null
  email: string | null
  telephone: string | null
  adresse: string | null
  ville: string | null
  commissionPct: number
  formule: FormuleStation
  bornesMax: number | null
  statut: 'actif' | 'suspendu'
  active: boolean
  motifSuspension: string | null
  debutContrat: string | null
  finContrat: string | null
  rib: string | null
  couleur: string | null
  messagesNonLus?: number
  bornes: number
  personnel: number
}

export interface ReleveMois {
  periode: string
  chiffreAffaires: number
  commission: number
  net: number
  sessions: number
  energieKwh: number
  statut?: 'paye' | 'a_payer' | 'en_cours' | 'neant'
  payeLe?: string | null
  reference?: string | null
}

export interface StationsVue {
  plateforme: {
    stations: number
    stationsActives: number
    bornes: number
    bornesSansStation: number
    chiffreAffairesMois: number
    commissionMois: number
    aReverser: number
    sessionsEnCours: number
  }
  stations: (Station & { mois: ReleveMois })[]
}

export interface StationDetail extends Station {
  bornesListe: { id: number; nom: string; reference: string; etat: string; puissanceKw: number; enLigne: boolean }[]
  personnelListe: { id: number; nom: string; email: string; role: Role; actif: boolean; derniereConnexion: string | null }[]
  releves: ReleveMois[]
  bornesActivite: BorneActivite[]
  recharges: RechargeStation[]
  clients: ClientStation[]
  annee: number
}

export interface BorneActivite {
  id: number
  nom: string
  etat: string
  enLigne: boolean
  puissanceKw: number
  puissanceActuelleKw: number
  sessionsEnCours: number
  sessionsJour: number
  energieJourKwh: number
}
export interface RechargeStation {
  id: number
  client: string
  borne: string | null
  borneId: number
  connecteur: string | null
  etat: string
  debut: string | null
  puissanceKw: number
  puissanceMaxKw: number | null
  energieKwh: number
  batterie: number | null
  prix: number
}
export interface ClientStation { id: number; nom: string; email: string | null; recharges: number; energieKwh: number; montant: number; derniere: string }
export interface MessageStation { id: number; dePlateforme: boolean; categorie: 'message' | 'demande' | 'annonce'; contenu: string; auteur: string; lu: boolean; date: string }

export interface MaStation {
  station: { id: number; nom: string; formule: FormuleStation; commissionPct: number; statut: string; finContrat: string | null }
  aujourdhui: { chiffreAffaires: number; sessions: number; energieKwh: number }
  mois: ReleveMois
  enDirect: { sessionsEnCours: number; puissanceKw: number; occupationPct: number }
  bornes: BorneActivite[]
  recharges: RechargeStation[]
  clients: ClientStation[]
  messagesNonLus: number
  serie: { jour: string; chiffreAffaires: number; energieKwh: number; sessions: number }[]
  releves: ReleveMois[]
}

export interface LoginResponse {
  token?: string
  user?: User
  twoFactor?: boolean
}

export interface Plateforme {
  nom: string
  logoUrl: string | null
  devise: string
  langue: 'fr' | 'en' | 'ar'
  fuseauHoraire: string
  googleClientId?: string | null
  soldeMinimumRecharge?: number
}

// --- Tableau de bord & supervision ---

export interface Stats {
  bornesTotal: number
  bornesActives: number
  bornesIndisponibles: number
  bornesOccupees: number
  tauxDisponibilite: number
  sessionsAujourdhui: number
  sessionsEnCours: number
  puissanceInstantaneeKw: number
  caTotal: number
  caAujourdhui: number
  caMois: number
  kwhTotal: number
  kwhAujourdhui: number
  tempsMoyenMinutes: number
  alertesOuvertes: number
  alertesCritiques: number
  maintenancesEnCours: number
}

export interface Series {
  jours: { jour: string; sessions: number; kwh: number; ca: number }[]
  parHeure: { heure: number; sessions: number }[]
  parConnecteur: { type: string; sessions: number }[]
}

export interface TopBorne {
  borneId: number
  borneNom: string
  sessions: number
  kwh: number
  ca: number
}

export interface SessionLive {
  id: number
  connecteurId: number
  typeConnecteur: string
  userNom: string
  etat: EtatSession
  dateDebut: string
  energieKwh: number
  puissanceKw: number | null
  pourcentageBatterie: number | null
  prix: number
  tempsRestantMinutes: number | null
}

export interface BorneSupervision {
  id: number
  nom: string
  reference: string
  adresse: string
  latitude: number
  longitude: number
  etat: EtatBorne
  puissanceKw: number
  enLigne: boolean
  websocket: boolean | null
  temperatureC: number | null
  dernierHeartbeat: string | null
  connecteursTotal: number
  connecteursOccupes: number
  alertesOuvertes: number
  connecteurs: { id: number; type: TypeConnecteur; puissanceKw: number; etat: EtatConnecteur }[]
  sessions: SessionLive[]
}

export interface Supervision {
  serveurOcpp: boolean
  horodatage: string
  bornes: BorneSupervision[]
}

// --- Bornes & connecteurs ---

export type EtatBorne =
  | 'disponible'
  | 'occupee'
  | 'indisponible'
  | 'hors_service'
  | 'maintenance'
  | 'deconnectee'
  | 'defaut'

export type TypeConnecteur = 'CCS' | 'Type2' | 'CHAdeMO' | 'AC' | 'DC'
export type EtatConnecteur = 'disponible' | 'occupe' | 'reserve' | 'indisponible' | 'defaut'

export interface Connecteur {
  id: number
  borneId: number
  numero?: number
  type: TypeConnecteur
  courant: 'AC' | 'DC'
  puissanceKw: number
  etat: EtatConnecteur
}

export interface Borne {
  id: number
  photoCredit?: string | null
  stationId?: number | null
  stationNom?: string | null
  /** Photo affichée dans l'application mobile. */
  photoUrl?: string | null
  source?: 'reseau' | 'publique'
  operateur?: string | null
  nom: string
  reference: string
  numeroSerie: string
  modele: string
  fabricant: string
  adresse: string
  site: string | null
  latitude: number
  longitude: number
  versionFirmware: string
  versionOcpp: '1.6' | '2.0.1'
  puissanceKw: number
  etat: EtatBorne
  enLigne: boolean
  dernierHeartbeat: string | null
  /** Dernière perte de la connexion OCPP (WebSocket), si la borne est déconnectée. */
  deconnecteeLe?: string | null
  /** Mot de passe OCPP configuré (Security Profile 1). */
  ocppSecurise?: boolean
  temperatureC: number | null
  tarifKwh: number
  tarifId: number | null
  tarifSpecialId: number | null
  tarifLibelle?: string
  /** Tarif en vigueur (espace client). */
  tarifApplique?: { nom: string; mode: 'kwh' | 'minute' | 'heure' | 'puissance'; prix: number; prixHeuresCreuses: number | null; heuresCreusesDebut: string | null; heuresCreusesFin: string | null; fraisSession: number; special: boolean; valideAu: string | null } | null
  exploitantId: number | null
  exploitantNom?: string | null
  technicienId: number | null
  technicienNom?: string | null
  /** Contacts de l'admin (exploitant) et du technicien de la borne — personnel uniquement. */
  responsables?: { admin: ContactResponsable | null; technicien: ContactResponsable | null }
  alertesOuvertes?: number
  connecteurs: Connecteur[]
}

export interface BorneInput {
  nom: string
  reference: string
  numeroSerie: string
  modele: string
  fabricant: string
  adresse: string
  site?: string | null
  latitude: number
  longitude: number
  versionFirmware: string
  versionOcpp: '1.6' | '2.0.1'
  puissanceKw: number
  tarifKwh: number
  tarifId?: number | null
  tarifSpecialId?: number | null
  exploitantId?: number | null
  technicienId?: number | null
  /** Station propriétaire (choisie par le super-admin). */
  stationId?: number | null
  etat?: EtatBorne
  connecteurs?: { type: TypeConnecteur; puissanceKw: number }[]
}

export interface BorneDetail {
  borne: Borne
  stats: {
    sessions30j: number
    kwh30j: number
    ca30j: number
    tauxOccupation: number
    maintenances: number
    pannesOuvertes: number
  }
  sessionsEnCours: Session[]
}

export interface EvenementHistorique {
  date: string
  categorie: 'session' | 'alerte' | 'maintenance' | 'firmware' | 'action'
  titre: string
  details: string | null
}

export type CommandeOcpp =
  | 'reset'
  | 'reset_hard'
  | 'unlock'
  | 'change_configuration'
  | 'get_configuration'
  | 'get_diagnostics'
  | 'remote_stop'

// --- Sessions ---

export type EtatSession = 'en_cours' | 'en_pause' | 'terminee' | 'annulee'
export type OrigineSession = 'application' | 'rfid' | 'back_office'

export interface Session {
  id: number
  borneId: number
  borneNom: string
  userId: number
  userNom: string
  connecteurId: number
  typeConnecteur: TypeConnecteur | string
  vehiculeId: number | null
  vehicule: string | null
  origine: OrigineSession
  badgeUid: string | null
  tarifNom: string | null
  dateDebut: string
  dateFin: string | null
  dureeMinutes: number
  energieKwh: number
  prix: number
  etat: EtatSession
  puissanceInstantaneeKw: number | null
  pourcentageBatterie: number | null
  tempsRestantMinutes: number | null
  motifAnnulation: string | null
  paiementStatut?: StatutPaiement | null
  factureId?: number | null
}

export interface Mesure {
  t: string
  energieKwh: number
  puissanceKw: number | null
  pourcentageBatterie: number | null
}

// --- Utilisateurs, RFID, véhicules ---

export interface AdminUser {
  id: number
  nom: string
  prenom: string
  email: string
  telephone: string | null
  role: Role
  actif: boolean
  soldeWallet: number
  deuxFacteurs: boolean
  qrToken: string | null
  derniereConnexion: string | null
  createdAt: string
  nbSessions?: number
  nbVehicules?: number
  nbBadges?: number
}

export interface UserOption {
  id: number
  nom: string
  email: string
  role: Role
}

export interface UserDetail {
  user: AdminUser
  stats: { sessions: number; kwh: number; depenses: number; impayes: number }
  souscription: Souscription | null
  souscriptions: Souscription[]
  vehicules: Vehicule[]
  badges: Badge[]
  sessions: Session[]
  paiements: Paiement[]
}

export interface EntreeHistorique {
  id: number
  auteur: string
  action: string
  cible: string | null
  details: string | null
  ip: string | null
  date: string
}

export type StatutBadge = 'actif' | 'inactif' | 'bloque' | 'expire' | 'non_associe'

export interface Badge {
  id: number
  uid: string
  libelle: string | null
  userId: number | null
  userNom: string | null
  actif: boolean
  bloque: boolean
  motifBlocage: string | null
  dateExpiration: string | null
  statut: StatutBadge
  derniereUtilisation: string | null
  createdAt: string
}

export interface EvenementBadge {
  id: number
  evenement: string
  details: string | null
  acteur: string
  borneNom: string | null
  date: string
}

export interface Vehicule {
  id: number
  userId: number
  userNom: string | null
  marque: string
  modele: string
  immatriculation: string
  typeConnecteur: TypeConnecteur
  capaciteBatterieKwh: number
  photoUrl?: string | null
  photoCredit?: string | null
  nbSessions?: number
  energieTotaleKwh?: number
}

// --- Paiements & facturation ---

export type StatutPaiement = 'paye' | 'en_attente' | 'rembourse' | 'rembourse_partiel' | 'echoue'

export interface Paiement {
  id: number
  userId: number
  userNom?: string | null
  sessionId: number | null
  souscriptionId: number | null
  objet: string
  montant: number
  montantRembourse: number
  methode: string
  statut: StatutPaiement
  referencePsp: string | null
  motifRemboursement: string | null
  rembourseLe: string | null
  regleLe: string | null
  date: string
}

export interface ResumePaiements {
  encaisse: number
  enAttente: number
  nbEnAttente: number
  rembourse: number
  parMethode: { methode: string; nombre: number; total: number }[]
}

export interface Facture {
  id: number
  sessionId: number
  numero: string
  date: string
  montantHt: number | null
  tauxTva: number | null
  montantTva: number | null
  montantTtc: number
  statut: 'emise' | 'payee' | 'remboursee'
  userId: number
  userNom?: string | null
}

// --- Tarification ---

export type ModeTarif = 'kwh' | 'minute' | 'heure' | 'puissance'

export interface Tarif {
  id: number
  /** null : tarif commun de la plateforme (lecture seule pour une station). */
  stationId?: number | null
  nom: string
  mode: ModeTarif
  prix: number
  prixHeuresCreuses: number | null
  heuresCreusesDebut: string | null
  heuresCreusesFin: string | null
  fraisSession: number
  special: boolean
  valideDu: string | null
  valideAu: string | null
  actif: boolean
  description: string | null
  nbBornes?: number
}

export interface Abonnement {
  id: number
  nom: string
  description: string | null
  prixMensuel: number
  remisePourcent: number
  kwhInclus: number
  actif: boolean
  nbAbonnes?: number
}

export interface Souscription {
  id: number
  userId: number
  userNom?: string | null
  abonnementId: number
  abonnementNom: string
  remisePourcent: number
  kwhInclus: number
  prixMensuel: number
  dateDebut: string
  dateFin: string
  statut: 'active' | 'expiree' | 'resiliee'
  renouvellementAuto: boolean
}

// --- Maintenance ---

export type StatutMaintenance = 'planifiee' | 'en_cours' | 'terminee' | 'annulee'
export type PrioriteMaintenance = 'basse' | 'normale' | 'haute' | 'urgente'

export interface Maintenance {
  id: number
  reference: string
  borneId: number
  borneNom: string
  panneId: number | null
  technicienId: number | null
  technicienNom: string | null
  type: 'preventive' | 'corrective'
  priorite: PrioriteMaintenance
  titre: string | null
  statut: StatutMaintenance
  description: string
  datePrevue: string | null
  dateDebut: string | null
  dateFin: string | null
  rapport: string | null
  periodiciteJours: number | null
  coutPieces?: number
  pieces?: { id: number; designation: string; reference: string | null; quantite: number; coutUnitaire: number }[]
  interventions?: { id: number; technicienNom: string | null; debut: string; fin: string | null; description: string }[]
  commentaires?: { id: number; auteur: string; contenu: string; date: string }[]
  photos?: DocumentItem[]
  createdAt: string
}

export interface MaintenanceInput {
  borneId: number
  panneId?: number | null
  technicienId?: number | null
  type: 'preventive' | 'corrective'
  priorite?: PrioriteMaintenance
  titre?: string | null
  description: string
  datePrevue?: string | null
  statut?: StatutMaintenance
  rapport?: string | null
  periodiciteJours?: number | null
}

export type StatutPanne = 'ouverte' | 'en_cours' | 'resolue'
export type GravitePanne = 'faible' | 'moyenne' | 'elevee' | 'critique'

export interface Panne {
  id: number
  borneId: number
  borneNom: string
  connecteurId: number | null
  alerteId: number | null
  type: string
  gravite: GravitePanne
  description: string
  statut: StatutPanne
  signaleParNom: string | null
  resolueLe: string | null
  ordresTravail?: { id: number; reference: string; statut: StatutMaintenance }[]
  createdAt: string
}

// --- Alertes ---

export type GraviteAlerte = 'info' | 'warning' | 'critique'

export interface Alerte {
  id: number
  borneId: number
  borneNom: string
  type: string
  gravite: GraviteAlerte
  message: string
  resolue: boolean
  resolueLe: string | null
  resolueParNom: string | null
  priseEnChargeParNom: string | null
  nbNotifications?: number
  createdAt: string
}

export interface NotificationEnvoyee {
  id: number
  alerteId: number | null
  canal: 'email' | 'sms' | 'push'
  destinataire: string
  sujet: string
  statut: 'envoyee' | 'echec' | 'desactive'
  erreur: string | null
  date: string
}

// --- Firmware ---

export interface Firmware {
  id: number
  version: string
  fabricant: string | null
  modele: string | null
  nomFichier: string
  taille: number
  checksum: string
  notes: string | null
  auteur: string | null
  nbDeploiements?: number
  createdAt: string
}

export type StatutDeploiement = 'en_attente' | 'telechargement' | 'telecharge' | 'installation' | 'installe' | 'echec'

export interface Deploiement {
  id: number
  firmwareId: number
  version: string
  borneId: number
  borneNom: string
  versionPrecedente: string | null
  statut: StatutDeploiement
  rollback: boolean
  message: string | null
  lanceParNom: string | null
  createdAt: string
  updatedAt: string
}

// --- Rapports ---

export type TypeRapport =
  | 'consommation'
  | 'chiffre_affaires'
  | 'utilisation'
  | 'disponibilite'
  | 'top_bornes'
  | 'top_clients'
  | 'maintenance'

export interface Rapport {
  type: TypeRapport
  titre: string
  periode: { debut: string; fin: string }
  devise: string
  colonnes: Record<string, string>
  lignes: Record<string, string | number>[]
  totaux: Record<string, number>
}

// --- Documents ---

export type TypeDocument = 'notice' | 'photo' | 'contrat' | 'plan' | 'garantie' | 'diagnostic' | 'autre'

export interface DocumentItem {
  id: number
  borneId: number | null
  borneNom: string | null
  maintenanceId: number | null
  type: TypeDocument
  titre: string
  nomFichier: string
  mime: string | null
  taille: number
  dateExpiration: string | null
  auteur: string | null
  createdAt: string
}

// --- Paramétrage ---

export interface Parametres {
  plateforme_nom: string
  logo: string | null
  logoUrl: string | null
  devise: string
  tva_taux: number
  fuseau_horaire: string
  langue: 'fr' | 'en' | 'ar'
  mentions_facture: string | null
  email_expediteur: string
  email_alertes_destinataires: string[]
  sms_actif: boolean
  sms_fournisseur: string
  sms_expediteur: string
  sms_api_key: string | null
  sms_destinataires: string[]
  push_actif: boolean
  notifications_regles: Record<GraviteAlerte, ('email' | 'sms' | 'push')[]>
  seuil_temperature: number
  delai_heartbeat_minutes: number
  deux_facteurs_personnel: boolean
}

export interface MatricePermissions {
  modules: Record<Module, string>
  roles: Role[]
  matrice: Record<Role, Record<Module, Niveau>>
}

// --- Audit ---

export interface AuditEntry {
  id: number
  userId: number | null
  userNom: string
  action: string
  cible: string | null
  details: string | null
  ip: string | null
  createdAt: string
}

export interface PageAudit extends Paginated<AuditEntry> {
  actions: string[]
}

// --- Espace client ---

export interface StatsClient {
  parMois: { mois: string; kwh: number; prix: number; sessions: number }[]
  kmAjoutes: number
  sessionsTotal: number
  energieTotaleKwh: number
  depensesTotal: number
  dureeMoyenneMinutes: number
}

export interface SessionClient {
  id: number
  borneId: number
  borneNom: string
  connecteurId: number
  typeConnecteur: string
  vehiculeId: number | null
  dateDebut: string
  dateFin: string | null
  dureeMinutes: number | null
  energieKwh: number
  prix: number
  etat: EtatSession
  puissanceInstantaneeKw: number | null
  pourcentageBatterie: number | null
  /** Budget = solde du wallet : la recharge s'arrête quand le prix l'atteint. */
  budget?: number | null
  arretSolde?: boolean
}

export interface FactureClient {
  id: number
  sessionId: number
  numero: string
  date: string
  montantTtc: number
  statut: 'emise' | 'payee' | 'remboursee'
}

// --- Trajet Volta et assistant (espace client, identiques à l'application mobile) ---
export interface PointTrajet { nom: string; lat: number; lng: number }
export interface LieuTrouve extends PointTrajet { detail: string }
export interface InstructionGuidage { texte: string; icone: string; distanceM: number; lat: number; lng: number }
export type EtapeTrajet =
  | { type: 'depart'; nom: string; batterie: number; lat: number; lng: number }
  | { type: 'recharge'; nom: string; borneId: number; choisie?: boolean; km: number; batterieArrivee: number; batterieDepart: number; puissanceKw: number; minutes: number; prix: number; etat: string; lat: number; lng: number }
  | { type: 'arrivee'; nom: string; km: number; batterie: number; lat: number; lng: number }
export interface TrajetVolta {
  depart: string
  arrivee: string
  possible: boolean
  verdict: 'batterie_suffit' | 'recharge_necessaire' | 'impossible'
  bloqueA: string | null
  etapes: EtapeTrajet[]
  distanceKm: number
  minutesConduite: number
  minutesRecharge: number
  coutDt: number
  coutEssenceDt: number
  trace: [number, number][]
  routeReelle: boolean
  conseil: string | null
  instructions: InstructionGuidage[]
  commentaire: string
  source: 'ia' | 'calcul'
}
export interface CarteAssistant { type: string; borneId?: number; titre?: string; [cle: string]: unknown }
export interface MessageVolta { id?: string | number; role: 'user' | 'assistant'; contenu: string; cartes?: CarteAssistant[]; suggestions?: string[]; erreur?: string | null }
export interface ReponseVolta { conversationId: string; message: MessageVolta; questionsRestantes: number | null }

// --- Paiement en ligne (Tunisie) ---
export type MoyenPaiement = 'carte' | 'flouci' | 'edinar'
export interface TransactionEnLigne {
  reference: string
  objet: 'recharge_wallet' | 'reglement' | 'abonnement'
  montant: number
  passerelle: string
  moyen: MoyenPaiement
  statut: 'en_cours' | 'reussie' | 'echouee' | 'expiree'
  url: string | null
  date: string
}

// --- Simulateur de recharge au badge (bornes du simulateur SAP) ---
export interface ContexteSimulateur {
  badges: { id: number; uid: string; libelle: string | null; statut: string }[]
  vehicules: Vehicule[]
  bornes: { id: number; nom: string; reference: string; adresse: string; puissanceKw: number; photoUrl: string | null; photoCredit: string | null; etat: string; connecteurs: { numero: number; type: string; puissanceKw: number; etat: string }[] }[]
  soldeWallet: number
}
export interface EtatSimulateur {
  borne: { connectee: boolean; connecteurs: { id: number; statut: string | null; transactionId: number | null; enCharge: boolean; idTag: string | null }[] } | null
  erreur: string | null
  journal: { t: string; sens: 'entrant' | 'sortant'; trame: unknown[] }[]
  session: { id: number; etat: string; debut: string | null; fin: string | null; energieKwh: number; prix: number; puissanceKw: number; batterie: number | null; transactionOcpp: string | null; modeDemarrage: string | null } | null
}

export interface ContactResponsable {
  id: number
  nom: string
  email: string
  telephone: string | null
  actif?: boolean
}
