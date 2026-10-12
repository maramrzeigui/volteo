import dayjs from 'dayjs'
import type {
  EtatBorne,
  EtatConnecteur,
  EtatSession,
  GraviteAlerte,
  GravitePanne,
  Module,
  ModeTarif,
  Niveau,
  OrigineSession,
  PrioriteMaintenance,
  Role,
  StatutBadge,
  StatutDeploiement,
  StatutMaintenance,
  StatutPaiement,
  StatutPanne,
  TypeDocument,
  TypeRapport,
} from './types'

let devise = 'DT'
let fuseau: string | undefined

/** Appliqué au démarrage depuis les paramètres de la plateforme (module 17). */
export function configurerFormat(options: { devise?: string; fuseauHoraire?: string }): void {
  if (options.devise) devise = options.devise
  if (options.fuseauHoraire) fuseau = options.fuseauHoraire
}

export const getDevise = () => devise

/** Date dans le fuseau horaire de la plateforme. */
export function enFuseau(date: string | Date | dayjs.Dayjs) {
  const d = dayjs(date)
  return fuseau ? d.tz(fuseau) : d
}

/** "12,34 DT" */
export function formatMontant(valeur: number | null | undefined, decimales = 2): string {
  const n = Number(valeur ?? 0)
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} ${devise}`
}

/** "12,5 kWh" */
export function formatEnergie(valeur: number | null | undefined): string {
  const n = Number(valeur ?? 0)
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh`
}

export function formatNombre(valeur: number | null | undefined, decimales = 0): string {
  return Number(valeur ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: decimales })
}

export function formatDate(date: string | null | undefined, avecHeure = true): string {
  if (!date) return '—'
  const d = enFuseau(date)
  return d.isValid() ? d.format(avecHeure ? 'DD/MM/YYYY HH:mm' : 'DD/MM/YYYY') : '—'
}

export function formatRelatif(date: string | null | undefined): string {
  if (!date) return 'jamais'
  const d = dayjs(date)
  return d.isValid() ? d.fromNow() : '—'
}

export function formatDuree(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  const m = Math.round(Number(minutes))
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1).replace('.', ',')} Ko`
  return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
}

// --- Libellés & couleurs ---

export const ETAT_BORNE_LABELS: Record<EtatBorne, string> = {
  disponible: 'Disponible',
  occupee: 'Occupée',
  indisponible: 'Non disponible',
  hors_service: 'Hors service',
  maintenance: 'Maintenance',
  deconnectee: 'Déconnectée',
  defaut: 'Défaut',
}

export const ETAT_BORNE_COLORS: Record<EtatBorne, string> = {
  disponible: 'success',
  occupee: 'processing',
  indisponible: 'warning',
  hors_service: 'default',
  maintenance: 'warning',
  deconnectee: 'error',
  defaut: 'error',
}

/** Couleurs hexa pour les marqueurs de la carte. */
export const ETAT_BORNE_HEX: Record<EtatBorne, string> = {
  disponible: '#F2A3AA',
  occupee: '#E5545F',
  indisponible: '#D9D9E0',
  hors_service: '#8E8E99',
  maintenance: '#D9D9E0',
  deconnectee: '#FF6B6B',
  defaut: '#FF6B6B',
}

export const ETAT_CONNECTEUR_LABELS: Record<EtatConnecteur, string> = {
  disponible: 'Disponible',
  occupe: 'Occupé',
  reserve: 'Réservé',
  indisponible: 'Indisponible',
  defaut: 'Défaut',
}

export const ETAT_CONNECTEUR_COLORS: Record<EtatConnecteur, string> = {
  disponible: 'success',
  occupe: 'processing',
  reserve: 'default',
  indisponible: 'default',
  defaut: 'error',
}

export const ETAT_SESSION_LABELS: Record<EtatSession, string> = {
  en_cours: 'En cours',
  en_pause: 'En pause',
  terminee: 'Terminée',
  annulee: 'Annulée',
}

export const ETAT_SESSION_COLORS: Record<EtatSession, string> = {
  en_cours: 'processing',
  en_pause: 'warning',
  terminee: 'success',
  annulee: 'error',
}

export const ORIGINE_SESSION_LABELS: Record<OrigineSession, string> = {
  application: 'Application',
  rfid: 'Badge RFID',
  back_office: 'Back-office',
}

export const GRAVITE_LABELS: Record<GraviteAlerte, string> = {
  info: 'Info',
  warning: 'Avertissement',
  critique: 'Critique',
}

export const GRAVITE_COLORS: Record<GraviteAlerte, string> = {
  info: 'processing',
  warning: 'warning',
  critique: 'error',
}

export const TYPE_ALERTE_LABELS: Record<string, string> = {
  borne_deconnectee: 'Borne déconnectée',
  defaut_materiel: 'Défaut matériel',
  surchauffe: 'Surchauffe',
  coupure_electrique: 'Coupure électrique',
  porte_ouverte: 'Porte ouverte',
  erreur_ocpp: 'Erreur OCPP',
}

export const STATUT_MAINTENANCE_LABELS: Record<StatutMaintenance, string> = {
  planifiee: 'Planifiée',
  en_cours: 'En cours',
  terminee: 'Terminée',
  annulee: 'Annulée',
}

export const STATUT_MAINTENANCE_COLORS: Record<StatutMaintenance, string> = {
  planifiee: 'processing',
  en_cours: 'warning',
  terminee: 'success',
  annulee: 'default',
}

export const PRIORITE_LABELS: Record<PrioriteMaintenance, string> = {
  basse: 'Basse',
  normale: 'Normale',
  haute: 'Haute',
  urgente: 'Urgente',
}

export const PRIORITE_COLORS: Record<PrioriteMaintenance, string> = {
  basse: 'default',
  normale: 'processing',
  haute: 'warning',
  urgente: 'error',
}

export const STATUT_PANNE_LABELS: Record<StatutPanne, string> = {
  ouverte: 'Ouverte',
  en_cours: 'En cours',
  resolue: 'Résolue',
}

export const STATUT_PANNE_COLORS: Record<StatutPanne, string> = {
  ouverte: 'error',
  en_cours: 'warning',
  resolue: 'success',
}

export const GRAVITE_PANNE_LABELS: Record<GravitePanne, string> = {
  faible: 'Faible',
  moyenne: 'Moyenne',
  elevee: 'Élevée',
  critique: 'Critique',
}

export const GRAVITE_PANNE_COLORS: Record<GravitePanne, string> = {
  faible: 'default',
  moyenne: 'warning',
  elevee: 'warning',
  critique: 'error',
}

export const TYPE_PANNE_LABELS: Record<string, string> = {
  electrique: 'Électrique',
  mecanique: 'Mécanique',
  logicielle: 'Logicielle',
  communication: 'Communication',
  connecteur: 'Connecteur',
  ecran: 'Écran / IHM',
  autre: 'Autre',
}

export const STATUT_PAIEMENT_LABELS: Record<StatutPaiement, string> = {
  paye: 'Payé',
  en_attente: 'En attente',
  rembourse: 'Remboursé',
  rembourse_partiel: 'Remboursé partiellement',
  echoue: 'Échoué',
}

export const STATUT_PAIEMENT_COLORS: Record<StatutPaiement, string> = {
  paye: 'success',
  en_attente: 'warning',
  rembourse: 'default',
  rembourse_partiel: 'default',
  echoue: 'error',
}

export const METHODE_PAIEMENT_LABELS: Record<string, string> = {
  wallet: 'Wallet',
  carte: 'Carte bancaire',
  topup_carte: 'Rechargement (carte)',
  topup_flouci: 'Rechargement (Flouci)',
  topup_edinar: 'Rechargement (e-DINAR)',
  flouci: 'Flouci',
  edinar: 'e-DINAR / D17',
  ajustement: 'Ajustement',
  especes: 'Espèces',
  virement: 'Virement',
}

export const STATUT_FACTURE_LABELS: Record<string, string> = {
  emise: 'À régler',
  payee: 'Payée',
  remboursee: 'Remboursée',
}

export const STATUT_FACTURE_COLORS: Record<string, string> = {
  emise: 'warning',
  payee: 'success',
  remboursee: 'default',
}

export const MODE_TARIF_LABELS: Record<ModeTarif, string> = {
  kwh: 'Par kWh',
  minute: 'Par minute',
  heure: 'Par heure',
  puissance: 'Par puissance (kW·h)',
}

export const MODE_TARIF_UNITES: Record<ModeTarif, string> = {
  kwh: '/ kWh',
  minute: '/ min',
  heure: '/ h',
  puissance: '/ kW·h',
}

export const STATUT_BADGE_LABELS: Record<StatutBadge, string> = {
  actif: 'Actif',
  inactif: 'Inactif',
  bloque: 'Bloqué',
  expire: 'Expiré',
  non_associe: 'Non associé',
}

export const STATUT_BADGE_COLORS: Record<StatutBadge, string> = {
  actif: 'success',
  inactif: 'default',
  bloque: 'error',
  expire: 'warning',
  non_associe: 'processing',
}

export const EVENEMENT_BADGE_LABELS: Record<string, string> = {
  creation: 'Création',
  association: 'Association',
  dissociation: 'Dissociation',
  activation: 'Activation',
  desactivation: 'Désactivation',
  blocage: 'Blocage',
  deblocage: 'Déblocage',
  expiration: "Date d'expiration",
  autorisation_acceptee: 'Autorisation acceptée',
  autorisation_refusee: 'Autorisation refusée',
  recharge_demarree: 'Recharge démarrée',
}

export const STATUT_DEPLOIEMENT_LABELS: Record<StatutDeploiement, string> = {
  en_attente: 'En attente',
  telechargement: 'Téléchargement',
  telecharge: 'Téléchargé',
  installation: 'Installation',
  installe: 'Installé',
  echec: 'Échec',
}

export const STATUT_DEPLOIEMENT_COLORS: Record<StatutDeploiement, string> = {
  en_attente: 'default',
  telechargement: 'processing',
  telecharge: 'processing',
  installation: 'processing',
  installe: 'success',
  echec: 'error',
}

export const TYPE_DOCUMENT_LABELS: Record<TypeDocument, string> = {
  notice: 'Notice',
  photo: 'Photo',
  contrat: 'Contrat',
  plan: 'Plan',
  garantie: 'Garantie',
  diagnostic: 'Diagnostic',
  autre: 'Autre',
}

export const TYPE_RAPPORT_LABELS: Record<TypeRapport, string> = {
  consommation: 'Consommation',
  chiffre_affaires: "Chiffre d'affaires",
  utilisation: 'Utilisation',
  disponibilite: 'Disponibilité',
  top_bornes: 'Top bornes',
  top_clients: 'Top clients',
  maintenance: 'Maintenance',
}

export const ROLE_LABELS: Record<Role, string> = {
  client: 'Client',
  super_admin: 'Super administrateur',
  exploitant: 'Exploitant',
  operateur: 'Opérateur',
  technicien: 'Technicien',
  service_client: 'Service client',
  finance: 'Finance',
}

export const ROLE_COLORS: Record<Role, string> = {
  client: 'default',
  super_admin: 'error',
  exploitant: 'processing',
  operateur: 'processing',
  technicien: 'warning',
  service_client: 'success',
  finance: 'warning',
}

export const ROLES_PERSONNEL: Role[] = [
  'super_admin',
  'exploitant',
  'operateur',
  'technicien',
  'service_client',
  'finance',
]

export const NIVEAU_LABELS: Record<Niveau, string> = {
  aucun: 'Aucun',
  lecture: 'Lecture',
  ecriture: 'Écriture',
}

export const MODULE_LABELS: Record<Module, string> = {
  dashboard: 'Tableau de bord',
  supervision: 'Supervision temps réel',
  bornes: 'Bornes & connecteurs',
  sessions: 'Sessions de recharge',
  utilisateurs: 'Utilisateurs',
  rfid: 'Badges RFID',
  vehicules: 'Véhicules',
  paiements: 'Paiements & facturation',
  tarification: 'Tarification & abonnements',
  maintenance: 'Maintenance',
  alertes: 'Alertes',
  firmware: 'Firmware',
  rapports: 'Rapports',
  documents: 'Documents',
  parametres: 'Paramétrage',
  audit: "Journal d'audit",
}

export const ACTION_AUDIT_LABELS: Record<string, string> = {
  connexion: 'Connexion',
  connexion_2fa: 'Connexion (2FA)',
  connexion_echouee: 'Connexion échouée',
  deconnexion: 'Déconnexion',
  inscription: 'Inscription',
  creation: 'Création',
  modification: 'Modification',
  suppression: 'Suppression',
  desactivation: 'Désactivation',
  reactivation: 'Réactivation',
  export: 'Export',
  commande_ocpp: 'Commande OCPP',
  remboursement: 'Remboursement',
  regularisation: 'Régularisation',
  recharge_wallet: 'Rechargement wallet',
  ajustement_wallet: 'Ajustement wallet',
  session_creee: 'Session créée',
  session_pause: 'Session en pause',
  session_reprise: 'Session reprise',
  session_terminee: 'Session terminée',
  session_annulee: 'Session annulée',
  deploiement_firmware: 'Déploiement firmware',
  rollback_firmware: 'Rollback firmware',
  affectation_tarif: 'Affectation tarif',
  resolution: 'Résolution alerte',
  prise_en_charge: 'Prise en charge alerte',
  reinitialisation_mot_de_passe: 'Réinitialisation mot de passe',
}

export function libelleAction(action: string): string {
  return ACTION_AUDIT_LABELS[action] ?? action.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}
