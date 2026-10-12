import type {
  LieuTrouve,
  PointTrajet,
  TrajetVolta,
  VilleTrajet,
  Abonnement,
  ConversationResume,
  EtatAssistant,
  MessageAssistant,
  BadgeRfid,
  Borne,
  Facture,
  KpisClient,
  Mesure,
  Paiement,
  Reservation,
  SessionRecharge,
  Souscription,
  Utilisateur,
  Vehicule,
} from '@/types/domain';
import {
  mockBadges,
  mockBornes,
  mockFactures,
  mockKpis,
  mockSessionActive,
  mockSessions,
  mockUtilisateur,
  mockVehicules,
} from '@/lib/mock-data';
import * as storage from '@/lib/storage';
import Constants from 'expo-constants';

/**
 * Client API REST — cible le backend Laravel (dossier backend/, Sanctum).
 *
 * USE_MOCK = true fait revenir l'app aux données de lib/mock-data.ts
 * (utile sans backend).
 *
 * Adresse de l'API :
 * - EXPO_PUBLIC_API_URL si elle est fixée au build (APK installable) ;
 * - sinon, en dev, la machine du bundler Expo, pour que téléphone, simulateur et
 *   web joignent tous la machine qui exécute `php artisan serve`.
 */
export const USE_MOCK = false;

const devHost = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
export const API_URL_DEFAUT = process.env.EXPO_PUBLIC_API_URL ?? `http://${devHost}:8000/api/v1`;

const TOKEN_KEY = 'borneapp.jwt';

/** Adresse complète d'un fichier servi par le backend (« /storage/… » → http://hôte:8000/storage/…). */
export function urlMedia(chemin: string | null | undefined): string | null {
  if (!chemin) return null;
  if (/^https?:\/\//.test(chemin)) return chemin;
  return API_URL_DEFAUT.replace(/\/api\/v1\/?$/, '') + chemin;
}

export async function urlApi(): Promise<string> {
  return API_URL_DEFAUT;
}

export async function getToken() {
  return storage.getItem(TOKEN_KEY);
}

/** Appelé quand l'API refuse le jeton (expiré, révoqué, compte désactivé) : l'app revient à la connexion. */
let surNonAutorise: (() => void) | null = null;
export function quandNonAutorise(rappel: (() => void) | null) {
  surNonAutorise = rappel;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${await urlApi()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401 && token && !path.startsWith('/auth/login')) {
    await storage.removeItem(TOKEN_KEY);
    surNonAutorise?.();
    throw new Error('Votre session a expiré. Reconnectez-vous.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // Erreur de validation Laravel : on affiche le premier message, plus précis que le résumé.
    const premiere = body?.errors ? (Object.values(body.errors as Record<string, string[]>)[0]?.[0] ?? null) : null;
    throw new Error(premiere ?? body?.message ?? `Erreur API (${res.status})`);
  }
  return res.json();
}

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------

/** Retourne l'utilisateur, ou `null` si un code 2FA a été envoyé par email. */
export async function login(email: string, motDePasse: string): Promise<Utilisateur | null> {
  if (USE_MOCK) {
    await delay();
    if (!email.includes('@') || motDePasse.length < 4) {
      throw new Error('Email ou mot de passe invalide');
    }
    await storage.setItem(TOKEN_KEY, 'mock-jwt-token');
    return { ...mockUtilisateur, email };
  }
  const data = await request<{ token?: string; user?: Utilisateur; twoFactor?: boolean }>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password: motDePasse }),
    }
  );
  if (data.twoFactor) return null;
  await storage.setItem(TOKEN_KEY, data.token!);
  return data.user!;
}

export async function verifier2fa(email: string, code: string): Promise<Utilisateur> {
  const data = await request<{ token: string; user: Utilisateur }>('/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  await storage.setItem(TOKEN_KEY, data.token);
  return data.user;
}

/** « Continuer avec Google » : échange l'ID token Google contre une session Volteo. */
export async function connexionGoogle(idToken: string): Promise<Utilisateur> {
  const data = await request<{ token: string; user: Utilisateur }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ id_token: idToken }),
  });
  await storage.setItem(TOKEN_KEY, data.token);
  return data.user;
}

export async function motDePasseOublie(email: string): Promise<void> {
  if (USE_MOCK) {
    await delay();
    return;
  }
  await request('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function reinitialiserMotDePasse(
  email: string,
  code: string,
  motDePasse: string
): Promise<void> {
  await request('/auth/reset', {
    method: 'POST',
    body: JSON.stringify({ email, code, password: motDePasse }),
  });
}

export async function register(payload: {
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  motDePasse: string;
}): Promise<Utilisateur> {
  if (USE_MOCK) {
    await delay();
    await storage.setItem(TOKEN_KEY, 'mock-jwt-token');
    return { ...mockUtilisateur, nom: payload.nom, prenom: payload.prenom, email: payload.email };
  }
  const data = await request<{ token: string; user: Utilisateur }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ ...payload, password: payload.motDePasse }),
  });
  await storage.setItem(TOKEN_KEY, data.token);
  return data.user;
}

export async function logout(): Promise<void> {
  if (!USE_MOCK) {
    await request('/auth/logout', { method: 'POST' }).catch(() => undefined);
  }
  await storage.removeItem(TOKEN_KEY);
}

export async function profil(): Promise<Utilisateur | null> {
  const token = await getToken();
  if (!token) return null;
  if (USE_MOCK) {
    await delay(200);
    return mockUtilisateur;
  }
  return request<Utilisateur>('/auth/me');
}

// ---------------------------------------------------------------------------
// Bornes & connecteurs
// ---------------------------------------------------------------------------

export async function listeBornes(): Promise<Borne[]> {
  if (USE_MOCK) {
    await delay();
    return mockBornes;
  }
  return request<Borne[]>('/bornes');
}

/** Par identifiant ou par référence OCPP (QR code collé sur la borne : borneapp://borne/BRN-TUN-001). */
export async function detailBorne(idOuReference: number | string): Promise<Borne> {
  if (USE_MOCK) {
    await delay(250);
    const borne = mockBornes.find((b) => String(b.id) === String(idOuReference) || b.reference === idOuReference);
    if (!borne) throw new Error('Borne introuvable');
    return borne;
  }
  return request<Borne>(`/bornes/${encodeURIComponent(String(idOuReference))}`);
}

// ---------------------------------------------------------------------------
// Sessions de recharge
// ---------------------------------------------------------------------------

export async function listeSessions(): Promise<SessionRecharge[]> {
  if (USE_MOCK) {
    await delay();
    return mockSessions;
  }
  return request<SessionRecharge[]>('/sessions');
}

export async function sessionActive(): Promise<SessionRecharge | null> {
  if (USE_MOCK) {
    await delay(200);
    return mockSessionActive;
  }
  const session = await request<SessionRecharge | null>('/sessions/active');
  return session?.id ? session : null;
}

/** Déclenche un RemoteStartTransaction côté serveur OCPP. */
export async function demarrerSession(borneId: number, connecteurId: number, vehiculeId?: number) {
  if (USE_MOCK) {
    await delay(600);
    return { ...mockSessionActive, borneId, connecteurId, dateDebut: new Date().toISOString() };
  }
  return request<SessionRecharge>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ borne_id: borneId, connecteur_id: connecteurId, vehicule_id: vehiculeId }),
  });
}

/** Déclenche un RemoteStopTransaction côté serveur OCPP. */
export async function arreterSession(sessionId: number) {
  if (USE_MOCK) {
    await delay(600);
    return {
      ...mockSessionActive,
      id: sessionId,
      etat: 'terminee' as const,
      dateFin: new Date().toISOString(),
    };
  }
  return request<SessionRecharge>(`/sessions/${sessionId}/stop`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Profil : véhicules, badges, factures, KPIs
// ---------------------------------------------------------------------------

export async function listeVehicules(): Promise<Vehicule[]> {
  if (USE_MOCK) {
    await delay(200);
    return mockVehicules;
  }
  return request<Vehicule[]>('/vehicules');
}

type VehiculeSaisie = Omit<Vehicule, 'id'>;

export async function enregistrerVehicule(vehicule: VehiculeSaisie, id?: number): Promise<Vehicule> {
  if (USE_MOCK) {
    await delay();
    return { ...vehicule, id: id ?? Date.now() };
  }
  return request<Vehicule>(id ? `/vehicules/${id}` : '/vehicules', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(vehicule),
  });
}

export async function supprimerVehicule(id: number): Promise<void> {
  if (USE_MOCK) return;
  await request(`/vehicules/${id}`, { method: 'DELETE' });
}

export async function listeBadges(): Promise<BadgeRfid[]> {
  if (USE_MOCK) {
    await delay(200);
    return mockBadges;
  }
  return request<BadgeRfid[]>('/badges');
}

/** Déclaration de perte ou de vol : le badge est aussitôt refusé par toutes les bornes. */
export async function bloquerBadge(id: number): Promise<BadgeRfid> {
  return request<BadgeRfid>(`/badges/${id}/bloquer`, { method: 'POST' });
}

export async function listeFactures(): Promise<Facture[]> {
  if (USE_MOCK) {
    await delay(200);
    return mockFactures;
  }
  return request<Facture[]>('/factures');
}

export async function kpisClient(): Promise<KpisClient> {
  if (USE_MOCK) {
    await delay(200);
    return mockKpis;
  }
  return request<KpisClient>('/stats/client');
}

// ---------------------------------------------------------------------------
// Wallet & factures PDF
// ---------------------------------------------------------------------------

/** Recharge le wallet (sandbox : crédit immédiat). Retourne le nouveau solde. */
export async function rechargerWallet(montant: number): Promise<number> {
  if (USE_MOCK) {
    await delay();
    return mockUtilisateur.soldeWallet + montant;
  }
  const data = await request<{ soldeWallet: number }>('/wallet/topup', {
    method: 'POST',
    body: JSON.stringify({ montant }),
  });
  return data.soldeWallet;
}

/** Historique des paiements : recharges, abonnements, rechargements, remboursements. */
export async function listePaiements(): Promise<Paiement[]> {
  if (USE_MOCK) return [];
  return request<Paiement[]>('/wallet/paiements');
}

/**
 * Règle un paiement différé (solde insuffisant en fin de recharge), avec le
 * wallet ou par carte (sandbox). Retourne le nouveau solde.
 */
export async function reglerPaiement(id: number, methode: 'wallet' | 'carte'): Promise<number> {
  const data = await request<{ soldeWallet: number }>(`/paiements/${id}/regler`, {
    method: 'POST',
    body: JSON.stringify({ methode }),
  });
  return data.soldeWallet;
}

/** URL de téléchargement du PDF d'une facture (à appeler avec le token). */
export async function urlFacturePdf(factureId: number): Promise<string> {
  return `${await urlApi()}/factures/${factureId}/pdf`;
}

// ---------------------------------------------------------------------------
// Télémétrie, réservations, favoris
// ---------------------------------------------------------------------------

/** Courbe de puissance d'une recharge (MeterValues OCPP enregistrées). */
export async function mesuresSession(sessionId: number): Promise<Mesure[]> {
  if (USE_MOCK) return [];
  return request<Mesure[]>(`/sessions/${sessionId}/mesures`);
}

export async function reservationActive(): Promise<Reservation | null> {
  if (USE_MOCK) return null;
  const r = await request<Reservation | null>('/reservations/active');
  return r?.id ? r : null;
}

/** Bloque la prise 15 minutes pour le client. */
export async function reserver(connecteurId: number): Promise<Reservation> {
  return request<Reservation>('/reservations', {
    method: 'POST',
    body: JSON.stringify({ connecteur_id: connecteurId }),
  });
}

export async function annulerReservation(id: number): Promise<void> {
  await request(`/reservations/${id}`, { method: 'DELETE' });
}

export async function favoris(): Promise<number[]> {
  if (USE_MOCK) return [];
  return request<number[]>('/favoris');
}

export async function basculerFavori(borneId: number, favori: boolean): Promise<void> {
  await request(`/favoris/${borneId}`, { method: favori ? 'POST' : 'DELETE' });
}

// ---------------------------------------------------------------------------
// Abonnements
// ---------------------------------------------------------------------------

export async function listeAbonnements(): Promise<Abonnement[]> {
  if (USE_MOCK) return [];
  return request<Abonnement[]>('/abonnements');
}

export async function souscriptionActive(): Promise<Souscription | null> {
  if (USE_MOCK) return null;
  const s = await request<Souscription | null>('/souscription');
  return s?.id ? s : null;
}

export async function souscrire(abonnementId: number, methode: 'wallet' | 'carte'): Promise<Souscription> {
  return request<Souscription>('/souscriptions', {
    method: 'POST',
    body: JSON.stringify({ abonnement_id: abonnementId, methode }),
  });
}

/** Arrête le renouvellement automatique : l'abonnement reste valable jusqu'à sa date de fin. */
export async function resilierAbonnement(): Promise<void> {
  await request('/souscription/resilier', { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Profil & sécurité
// ---------------------------------------------------------------------------

export async function mettreAJourProfil(champs: {
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string | null;
}): Promise<Utilisateur> {
  if (USE_MOCK) {
    await delay();
    return { ...mockUtilisateur, ...champs };
  }
  return request<Utilisateur>('/auth/profil', { method: 'PUT', body: JSON.stringify(champs) });
}

export async function changerMotDePasse(actuel: string, nouveau: string): Promise<void> {
  await request('/auth/profil', {
    method: 'PUT',
    body: JSON.stringify({ motDePasseActuel: actuel, nouveauMotDePasse: nouveau }),
  });
}

/** Active ou désactive la double authentification (code envoyé par email à la connexion). */
export async function definirDeuxFacteurs(actif: boolean): Promise<Utilisateur> {
  return request<Utilisateur>('/auth/2fa', { method: 'PUT', body: JSON.stringify({ actif }) });
}

// ---------------------------------------------------------------------------
// Assistant IA (Volta) : l'IA tourne sur le serveur, la clé ne quitte jamais l'API.
// ---------------------------------------------------------------------------

/** Erreur de l'assistant avec son statut HTTP (429 : quota du jour atteint, 503 : indisponible). */
export class ErreurAssistant extends Error {
  constructor(message: string, public readonly statut: number) {
    super(message);
  }
}

export async function villesTrajet(): Promise<VilleTrajet[]> {
  return request<VilleTrajet[]>('/assistant/trajet/villes');
}

export async function planifierTrajet(
  depart: PointTrajet | string,
  arrivee: PointTrajet | string,
  batterie?: number | null,
  arrets: number[] = []
): Promise<TrajetVolta> {
  return request<TrajetVolta>('/assistant/trajet', {
    method: 'POST',
    body: JSON.stringify({ depart, arrivee, batterie: batterie ?? undefined, arrets }),
  });
}

/** Nom du lieu touché sur la carte. */
export async function lieuAuPoint(lat: number, lng: number): Promise<LieuTrouve> {
  return request<LieuTrouve>(`/assistant/lieux/point?lat=${lat}&lng=${lng}`);
}

export async function rechercherLieux(q: string): Promise<LieuTrouve[]> {
  return request<LieuTrouve[]>(`/assistant/lieux?q=${encodeURIComponent(q)}`);
}

export async function etatAssistant(): Promise<EtatAssistant> {
  if (USE_MOCK) return { disponible: false, questionsRestantes: 0, questionsParJour: 0 };
  return request<EtatAssistant>('/assistant/etat');
}

export async function poserQuestion(
  question: string,
  conversationId?: string | null
): Promise<{ conversationId: string; titre: string | null; message: MessageAssistant; questionsRestantes: number | null }> {
  const token = await getToken();
  const res = await fetch(`${await urlApi()}/assistant/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ question, conversationId: conversationId ?? undefined }),
  });
  const corps = await res.json().catch(() => null);
  if (res.status === 401) {
    await storage.removeItem(TOKEN_KEY);
    surNonAutorise?.();
  }
  if (!res.ok) {
    const premiere = corps?.errors ? (Object.values(corps.errors as Record<string, string[]>)[0]?.[0] ?? null) : null;
    throw new ErreurAssistant(premiere ?? corps?.message ?? 'L’assistant ne répond pas pour le moment.', res.status);
  }
  return corps;
}

export async function conversationsAssistant(): Promise<ConversationResume[]> {
  return request<ConversationResume[]>('/assistant/conversations');
}

export async function conversationAssistant(id: string): Promise<{ id: string; titre: string | null; messages: MessageAssistant[] }> {
  return request(`/assistant/conversations/${id}`);
}

export async function supprimerConversation(id: string): Promise<void> {
  await request(`/assistant/conversations/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Paiement en ligne (Tunisie) : carte bancaire, Flouci, e-DINAR / D17
// ---------------------------------------------------------------------------

export type MoyenPaiement = 'carte' | 'flouci' | 'edinar';
export type TransactionEnLigne = {
  reference: string;
  objet: 'recharge_wallet' | 'reglement' | 'abonnement';
  montant: number;
  passerelle: string;
  moyen: MoyenPaiement;
  statut: 'en_cours' | 'reussie' | 'echouee' | 'expiree';
  url: string | null;
  soldeWallet?: number;
};

export async function moyensPaiement(): Promise<{ moyens: { moyen: MoyenPaiement; libelle: string; passerelle: string }[]; modeTest: boolean }> {
  return request('/paiements/moyens');
}

export async function payerEnLigne(input: {
  objet: 'recharge_wallet' | 'reglement' | 'abonnement';
  moyen: MoyenPaiement;
  montant?: number;
  paiement_id?: number;
  abonnement_id?: number;
}): Promise<TransactionEnLigne> {
  return request('/paiements/en-ligne', { method: 'POST', body: JSON.stringify({ ...input, canal: 'mobile' }) });
}

export async function transactionEnLigne(reference: string): Promise<TransactionEnLigne> {
  return request(`/paiements/en-ligne/${reference}`);
}
