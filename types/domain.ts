/**
 * Modèle de domaine — aligné sur le cahier des charges "Bornes de recharge".
 * Ces types reflètent les ressources exposées par l'API REST Laravel.
 */

export type Role =
  | 'super_admin'
  | 'exploitant'
  | 'operateur'
  | 'technicien'
  | 'service_client'
  | 'finance'
  | 'client';

export type EtatBorne =
  | 'disponible'
  | 'occupee'
  | 'indisponible'
  | 'hors_service'
  | 'maintenance'
  | 'deconnectee'
  | 'defaut'
  | 'inconnu';

export type TypeConnecteur = 'CCS' | 'Type2' | 'CHAdeMO' | 'AC' | 'DC';

export type EtatConnecteur = 'disponible' | 'occupe' | 'reserve' | 'indisponible' | 'defaut' | 'inconnu';

/** reseau : bornes de l'exploitant (pilotables). publique : bornes d'autres opérateurs, en consultation seule. */
export type SourceBorne = 'reseau' | 'publique';

export type EtatSession = 'en_cours' | 'en_pause' | 'terminee' | 'annulee';

export interface Utilisateur {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string | null;
  role: Role;
  soldeWallet: number;
  /** Photo de profil (compte Google). */
  photoUrl?: string | null;
  compteGoogle?: boolean;
  /** Double authentification par email activée. */
  deuxFacteurs?: boolean;
  /** Jeton encodé dans le QR code d'identification (borne, agence). */
  qrToken?: string | null;
}

export interface Connecteur {
  id: number;
  borneId: number;
  type: TypeConnecteur;
  puissanceKw: number;
  etat: EtatConnecteur;
}

export interface Borne {
  id: number;
  source: SourceBorne;
  operateur: string | null;
  nom: string;
  reference: string;
  numeroSerie: string | null;
  modele: string | null;
  fabricant: string | null;
  adresse: string;
  /** Photo de la borne (chemin servi par le backend), sinon illustration. */
  photoUrl?: string | null;
  /** Auteur et licence d'une photo sous licence libre (à afficher). */
  photoCredit?: string | null;
  latitude: number;
  longitude: number;
  versionFirmware: string | null;
  versionOcpp: '1.6' | '2.0.1' | null;
  puissanceKw: number | null;
  etat: EtatBorne;
  dernierHeartbeat: string | null; // ISO 8601
  /** Borne joignable en OCPP (WebSocket ouvert et heartbeat récent). */
  enLigne?: boolean;
  /** Dernière perte de connexion OCPP, si la borne est hors ligne. */
  deconnecteeLe?: string | null;
  temperatureC?: number;
  connecteurs: Connecteur[];
  tarifKwh: number; // prix de repli au kWh (DT), si aucun tarif n'est défini
  /** Libellé court du tarif en vigueur, ex. « 0,300 / kWh ». */
  tarifLibelle?: string;
  /** Tarif en vigueur détaillé (réseau BorneApp uniquement). */
  tarifApplique?: TarifApplique | null;
}

export type ModeTarif = 'kwh' | 'minute' | 'heure' | 'puissance';

export interface TarifApplique {
  nom: string;
  mode: ModeTarif;
  prix: number;
  prixHeuresCreuses: number | null;
  heuresCreusesDebut: string | null; // HH:mm
  heuresCreusesFin: string | null;
  fraisSession: number;
  special: boolean;
  valideAu: string | null;
}

export interface SessionRecharge {
  id: number;
  borneId: number;
  borneNom: string;
  connecteurId: number;
  typeConnecteur: TypeConnecteur;
  /** Puissance nominale de la prise utilisée (kW). */
  puissanceMaxKw?: number | null;
  vehiculeId?: number;
  dateDebut: string;
  dateFin?: string;
  dureeMinutes?: number;
  energieKwh: number;
  prix: number;
  etat: EtatSession;
  puissanceInstantaneeKw?: number; // renseigné quand la session est en cours
  pourcentageBatterie?: number;
  /** « en_attente » : solde insuffisant à la fin de la recharge, paiement différé à régler. */
  paiementStatut?: StatutPaiement | null;
  /** Budget = solde du wallet : la recharge s'arrête quand le prix l'atteint. */
  budget?: number | null;
  /** Recharge arrêtée automatiquement parce que le solde a été atteint. */
  arretSolde?: boolean;
}

export interface Vehicule {
  id: number;
  marque: string;
  modele: string;
  immatriculation: string;
  typeConnecteur: TypeConnecteur;
  capaciteBatterieKwh: number;
}

export type StatutBadge = 'actif' | 'inactif' | 'bloque' | 'expire' | 'non_associe';

export interface BadgeRfid {
  id: number;
  uid: string;
  libelle?: string | null;
  /** Utilisable à la borne (actif, non bloqué, non expiré). */
  actif: boolean;
  bloque?: boolean;
  statut?: StatutBadge;
  dateExpiration?: string | null;
}

export interface Facture {
  id: number;
  sessionId: number;
  numero: string;
  date: string;
  montantTtc: number;
  montantHt?: number | null;
  montantTva?: number | null;
  tauxTva?: number | null;
  statut?: 'emise' | 'payee' | 'remboursee';
  urlPdf?: string;
}

export type StatutPaiement = 'paye' | 'en_attente' | 'rembourse' | 'rembourse_partiel' | 'echoue';

export interface Paiement {
  id: number;
  sessionId: number | null;
  souscriptionId: number | null;
  /** Libellé lisible : « Recharge #12 », « Abonnement », « Rechargement wallet »… */
  objet: string;
  montant: number;
  montantRembourse: number;
  methode: string;
  statut: StatutPaiement;
  date: string;
}

export interface Abonnement {
  id: number;
  nom: string;
  description: string | null;
  prixMensuel: number;
  remisePourcent: number;
  kwhInclus: number;
}

export interface Souscription {
  id: number;
  abonnementId: number;
  abonnementNom: string;
  remisePourcent: number;
  kwhInclus: number;
  prixMensuel: number;
  dateDebut: string;
  dateFin: string;
  statut: 'active' | 'expiree' | 'resiliee';
  renouvellementAuto: boolean;
}

export interface StatMois {
  mois: string; // AAAA-MM
  kwh: number;
  prix: number;
  sessions: number;
}

export interface KpisClient {
  sessionsTotal: number;
  energieTotaleKwh: number;
  depensesTotal: number;
  dureeMoyenneMinutes: number;
  parMois: StatMois[];
  /** Autonomie ajoutée, sur la base de `kwhAux100Km`. */
  kmAjoutes: number;
  kwhAux100Km: number;
}

/** Point de télémétrie OCPP (MeterValues). */
export interface Mesure {
  t: string;
  energieKwh: number;
  puissanceKw: number | null;
  pourcentageBatterie: number | null;
}

export interface Reservation {
  id: number;
  borneId: number;
  borneNom: string;
  connecteurId: number;
  typeConnecteur: TypeConnecteur;
  puissanceKw: number;
  expireLe: string;
}

// ---------------------------------------------------------------------------
// Assistant IA (Volta)
// ---------------------------------------------------------------------------

export type CarteAssistant =
  | {
      type: 'borne';
      borneId: number;
      reference: string;
      nom: string;
      adresse: string;
      etat: EtatBorne;
      source: SourceBorne;
      puissanceKw: number | null;
      priseLibres: number;
      prisesTotal: number;
      tarif: string | null;
      distanceKm?: number | null;
    }
  | {
      type: 'estimation';
      borneId: number;
      borneNom: string;
      prise: string;
      energieKwh: number;
      dureeMinutes: number;
      prix: number;
      devise: string;
      remisePourcent: number;
      kwhOfferts: number;
    }
  | {
      type: 'compte';
      soldeWallet: number;
      devise: string;
      aRegler: number;
      abonnement: string | null;
      kwhRestants: number | null;
    }
  | {
      type: 'recharge';
      sessionId: number;
      borneNom: string;
      energieKwh: number;
      puissanceKw: number | null;
      batterie: number | null;
      prix: number;
      enPause: boolean;
    };

export interface MessageAssistant {
  id: number | string;
  role: 'utilisateur' | 'assistant';
  contenu: string;
  cartes: CarteAssistant[];
  suggestions: string[];
  erreur: boolean;
  date?: string | null;
}

export interface ConversationResume {
  id: string;
  titre: string | null;
  messages: number;
  derniereActivite: string | null;
}

/** « Trajet Volta » : étape d'un voyage planifié. */
export type EtapeTrajet =
  | { type: 'depart'; nom: string; batterie: number; lat: number; lng: number }
  | {
      type: 'recharge';
      nom: string;
      borneId: number;
      /** Borne choisie par le conducteur (sinon proposée par Volta). */
      choisie?: boolean;
      lat: number;
      lng: number;
      km: number;
      batterieArrivee: number;
      batterieDepart: number;
      puissanceKw: number;
      minutes: number;
      prix: number;
      etat: EtatBorne;
    }
  | { type: 'arrivee'; nom: string; km: number; batterie: number; lat: number; lng: number };

export interface TrajetVolta {
  depart: string;
  arrivee: string;
  /** false : aucune borne du réseau ne permet d'atteindre la destination. */
  possible: boolean;
  /** La batterie suffit, une recharge est nécessaire, ou le trajet est impossible. */
  verdict: 'batterie_suffit' | 'recharge_necessaire' | 'impossible';
  /** Étape qu'il est impossible d'atteindre, le cas échéant. */
  bloqueA: string | null;
  /** Tracé routier [[lat, lng], …] à dessiner sur la carte. */
  trace: [number, number][];
  /** Distances et durée calculées sur les routes réelles (sinon estimées). */
  routeReelle: boolean;
  conseil: string | null;
  /** Guidage pas à pas (vide si l'itinéraire routier n'est pas disponible). */
  instructions: InstructionGuidage[];
  etapes: EtapeTrajet[];
  distanceKm: number;
  minutesConduite: number;
  minutesRecharge: number;
  coutDt: number;
  coutEssenceDt: number;
  vehicule: string | null;
  /** Commentaire de copilote rédigé par l'IA (ou calculé sans IA). */
  commentaire: string;
  source: 'ia' | 'calcul';
}

export interface InstructionGuidage {
  texte: string;
  /** Icône de la manœuvre (flèche, rond-point, arrivée). */
  icone: string;
  distanceM: number;
  lat: number;
  lng: number;
}

/** Point de départ ou d'arrivée : position GPS, adresse ou lieu choisi sur la carte. */
export interface PointTrajet {
  nom: string;
  lat: number;
  lng: number;
}

export interface LieuTrouve extends PointTrajet {
  detail: string;
}

export interface VilleTrajet {
  cle: string;
  nom: string;
  lat: number;
  lng: number;
}

export interface EtatAssistant {
  disponible: boolean;
  /** null : illimité (client abonné). */
  questionsRestantes: number | null;
  questionsParJour: number;
}
