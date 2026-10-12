/**
 * Serveur OCPP 1.6J (profil JSON) pour Volteo.
 *
 * - Les bornes se connectent en WebSocket sur ws://HOTE:9220/ocpp/{reference}
 *   (sous-protocole « ocpp1.6 »), authentifiées en HTTP Basic (OCPP 1.6
 *   Security Profile 1 : identifiant = référence, mot de passe propre à la borne,
 *   vérifié par l'API Laravel). Compatible avec le simulateur SAP
 *   e-mobility-charging-stations-simulator et avec simulator.js.
 * - Chaque événement est relayé à l'API Laravel (routes /api/v1/internal/ocpp/*,
 *   authentifiées par le secret partagé X-Ocpp-Secret).
 * - L'état « déconnectée » est calculé : fermeture du WebSocket ou ping sans
 *   réponse → événement /deconnexion immédiat.
 * - Un serveur HTTP local (port 9221) reçoit les commandes du backend
 *   (RemoteStart/StopTransaction, Reset, UnlockConnector, Change/GetConfiguration,
 *   UpdateFirmware, GetDiagnostics, SetChargingProfile, ClearChargingProfile).
 * - Un relais WebSocket (port 9222, /live?token=...) pousse en temps réel les
 *   événements métier diffusés par Laravel (POST /broadcast) vers les clients.
 *
 * Lancer : npm start   (variables : LARAVEL_URL, OCPP_SHARED_SECRET, OCPP_PORT, HTTP_PORT, HTTP_HOST, LIVE_PORT)
 */
import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const OCPP_PORT = Number(process.env.OCPP_PORT ?? 9220);
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 9221);
const HTTP_HOST = process.env.HTTP_HOST ?? '127.0.0.1';
const LIVE_PORT = Number(process.env.LIVE_PORT ?? 9222);
const LARAVEL_URL = process.env.LARAVEL_URL ?? 'http://127.0.0.1:8000/api/v1';
const SECRET_DEV = 'borneapp-ocpp-secret-dev';
const SECRET = process.env.OCPP_SHARED_SECRET ?? SECRET_DEV;

/** Délai de réponse d'une borne à une commande (ms). */
const DELAI_COMMANDE = 8000;
/** Intervalle des pings WebSocket : une borne qui ne répond pas à deux pings est déconnectée. */
const INTERVALLE_PING = 30000;
/** Taille maximale d'une trame OCPP ou d'une requête de commande (octets). */
const TAILLE_MAX = 1024 * 1024;
/** Identité de borne OCPP (CiString) acceptée dans l'URL. */
const REFERENCE_VALIDE = /^[A-Za-z0-9._-]{1,64}$/;

// Types de message OCPP-J
const CALL = 2;
const CALLRESULT = 3;
const CALLERROR = 4;

const log = (...args) => console.log(new Date().toISOString(), ...args);

if (SECRET === SECRET_DEV) {
  if (process.env.NODE_ENV === 'production') {
    console.error('OCPP_SHARED_SECRET doit être défini en production.');
    process.exit(1);
  }
  log('⚠️  Secret de développement utilisé : définissez OCPP_SHARED_SECRET hors développement.');
}

/** reference borne -> { ws, pending: Map<messageId, resolve>, vivante: boolean } */
const bornes = new Map();

async function versLaravel(path, payload) {
  try {
    const res = await fetch(`${LARAVEL_URL}/internal/ocpp${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Ocpp-Secret': SECRET,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok && res.status !== 401) log(`⚠️ Laravel ${path} → ${res.status}`);
    const corps = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { statut: res.status, corps };
  } catch (err) {
    log(`⚠️ Laravel injoignable (${path}): ${err.message}`);
    return { statut: 0, corps: null };
  }
}

const versLaravelCorps = async (path, payload) => (await versLaravel(path, payload)).corps;

// ---------------------------------------------------------------------------
// Lecture des MeterValues (OCPP 1.6 §7.31) : measurand par défaut
// Energy.Active.Import.Register, unités Wh/kWh et W/kW, valeurs par phase.
// ---------------------------------------------------------------------------

const MESURE_ENERGIE = 'Energy.Active.Import.Register';
const FACTEURS = {
  [MESURE_ENERGIE]: { Wh: 1, kWh: 1000 },
  'Power.Active.Import': { W: 1, kW: 1000 },
  SoC: { Percent: 1 },
};
const UNITE_PAR_DEFAUT = { [MESURE_ENERGIE]: 'Wh', 'Power.Active.Import': 'W', SoC: 'Percent' };

/** Valeur totale d'une grandeur : l'échantillon global, sinon la somme des phases L1/L2/L3. */
function valeurTotale(echantillons, measurand) {
  if (!echantillons?.length) return null;
  const convertir = (e) => {
    const facteur = FACTEURS[measurand][e.unit ?? UNITE_PAR_DEFAUT[measurand]];
    const v = Number(e.value);
    return facteur !== undefined && Number.isFinite(v) ? v * facteur : null;
  };
  const global = echantillons.find((e) => !e.phase);
  if (global) return convertir(global);

  const parPhase = new Map();
  for (const e of echantillons) {
    const phase = /^L[123]/.exec(e.phase ?? '')?.[0];
    if (phase && !parPhase.has(phase)) parPhase.set(phase, convertir(e));
  }
  const valeurs = [...parPhase.values()].filter((v) => v !== null);
  return valeurs.length ? valeurs.reduce((a, b) => a + b, 0) : null;
}

/** Dernière valeur connue de chaque grandeur suivie, sur l'ensemble des meterValue reçus. */
function lireMesures(meterValue) {
  const resultat = { indexWh: null, puissanceW: null, soc: null };
  for (const mv of Array.isArray(meterValue) ? meterValue : []) {
    const parGrandeur = {};
    for (const e of Array.isArray(mv?.sampledValue) ? mv.sampledValue : []) {
      const m = e?.measurand ?? MESURE_ENERGIE;
      if (FACTEURS[m]) (parGrandeur[m] ??= []).push(e);
    }
    resultat.indexWh = valeurTotale(parGrandeur[MESURE_ENERGIE], MESURE_ENERGIE) ?? resultat.indexWh;
    resultat.puissanceW = valeurTotale(parGrandeur['Power.Active.Import'], 'Power.Active.Import') ?? resultat.puissanceW;
    resultat.soc = valeurTotale(parGrandeur.SoC, 'SoC') ?? resultat.soc;
  }
  return resultat;
}

// ---------------------------------------------------------------------------
// Serveur WebSocket OCPP (côté bornes)
// ---------------------------------------------------------------------------

class ErreurOcpp extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: TAILLE_MAX,
  handleProtocols: (protocols) => (protocols.has('ocpp1.6') ? 'ocpp1.6' : false),
});

function refuserUpgrade(socket, code, texte, entetes = {}) {
  const lignes = Object.entries({ Connection: 'close', 'Content-Length': 0, ...entetes }).map(([k, v]) => `${k}: ${v}`);
  socket.write(`HTTP/1.1 ${code} ${texte}\r\n${lignes.join('\r\n')}\r\n\r\n`);
  socket.destroy();
}

/** Identifiants HTTP Basic de l'en-tête Authorization, ou null. */
function identifiantsBasic(entete) {
  const m = /^Basic\s+(.+)$/i.exec(entete ?? '');
  if (!m) return null;
  const decode = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decode.indexOf(':');
  return i < 0 ? null : { utilisateur: decode.slice(0, i), motDePasse: decode.slice(i + 1) };
}

const serveurOcpp = http.createServer((_req, res) => {
  res.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8', Upgrade: 'websocket' });
  res.end('Serveur OCPP 1.6J : connexion WebSocket attendue sur /ocpp/{reference}\n');
});

serveurOcpp.on('upgrade', async (req, socket, head) => {
  socket.on('error', () => socket.destroy());

  const match = /^\/ocpp\/([^/?#]+)\/?(?:\?.*)?$/.exec(req.url ?? '');
  let reference = null;
  try {
    reference = match ? decodeURIComponent(match[1]) : null;
  } catch {
    reference = null;
  }
  if (!reference || !REFERENCE_VALIDE.test(reference)) {
    return refuserUpgrade(socket, 404, 'Not Found');
  }

  // Security Profile 1 : l'identifiant Basic doit être la référence de la borne.
  const identifiants = identifiantsBasic(req.headers.authorization);
  if (identifiants && identifiants.utilisateur !== reference) {
    log(`⛔ ${reference} : identifiant Basic « ${identifiants.utilisateur} » différent de la référence`);
    return refuserUpgrade(socket, 401, 'Unauthorized', { 'WWW-Authenticate': 'Basic realm="OCPP"' });
  }

  const { statut, corps } = await versLaravel('/connexion', { reference, motDePasse: identifiants?.motDePasse ?? null });
  if (statut === 0 || statut >= 500) {
    return refuserUpgrade(socket, 503, 'Service Unavailable', { 'Retry-After': 30 });
  }
  if (!corps?.accepte) {
    log(`⛔ Connexion refusée : ${reference} — ${corps?.message ?? `HTTP ${statut}`}`);
    return refuserUpgrade(socket, 401, 'Unauthorized', { 'WWW-Authenticate': 'Basic realm="OCPP"' });
  }

  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, reference));
});

wss.on('connection', (ws, _req, reference) => {
  // Une borne qui se reconnecte remplace son ancienne connexion (souvent à demi morte).
  const ancienne = bornes.get(reference);
  if (ancienne) {
    ancienne.remplacee = true;
    ancienne.ws.terminate();
    log(`♻️  Nouvelle connexion de ${reference} : l'ancienne est fermée`);
  }

  const entree = { ws, pending: new Map(), vivante: true, remplacee: false };
  bornes.set(reference, entree);
  log(`🔌 Borne connectée : ${reference}`);
  diffuser('ocpp.connexion', { reference, connectee: true });
  void resynchroniser(reference);

  ws.on('pong', () => {
    entree.vivante = true;
  });

  ws.on('message', (raw, binaire) => {
    traiterTrame(reference, ws, entree, raw, binaire).catch((err) => log(`⚠️ ${reference} : ${err.message}`));
  });

  ws.on('error', (err) => log(`⚠️ ${reference} : ${err.message}`));

  ws.on('close', () => {
    for (const resolve of entree.pending.values()) resolve({ etat: 'hors_ligne' });
    entree.pending.clear();
    // Fermeture de l'ancienne connexion après remplacement : la borne reste connectée.
    if (entree.remplacee || bornes.get(reference) !== entree) return;
    bornes.delete(reference);
    log(`❌ Borne déconnectée : ${reference}`);
    diffuser('ocpp.connexion', { reference, connectee: false });
    void versLaravel('/deconnexion', { reference });
  });
});

// Battement de cœur WebSocket : une connexion TCP morte (câble, 4G) est détectée en ≤ 2 pings.
setInterval(() => {
  for (const [reference, entree] of bornes) {
    if (!entree.vivante) {
      log(`⏱️  ${reference} ne répond plus au ping`);
      entree.ws.terminate();
      continue;
    }
    entree.vivante = false;
    entree.ws.ping();
  }
}, INTERVALLE_PING).unref();

/**
 * Reconnexion sans redémarrage : la borne n'envoie pas de BootNotification (OCPP 1.6 §4.2).
 * La connexion authentifiée prouve qu'elle est joignable (état recalculé tout de suite),
 * puis TriggerMessage lui fait renvoyer l'état réel de ses prises.
 */
async function resynchroniser(reference) {
  await versLaravel('/heartbeat', { reference });
  await new Promise((r) => setTimeout(r, 1500));
  const r = await commanderBorne(reference, 'TriggerMessage', { requestedMessage: 'StatusNotification' });
  if (r.etat === 'ok' && r.reponse.status !== 'Accepted') {
    log(`ℹ️  ${reference} : TriggerMessage ${r.reponse.status ?? 'refusé'}`);
  }
}

function envoyer(ws, trame) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(trame));
  for (const [reference, entree] of bornes) if (entree.ws === ws) journaliser(reference, 'sortant', trame);
}

/** Journal des dernières trames OCPP-J par borne (dialogue OCPP affiché dans le simulateur de recharge). */
const journaux = new Map();
function journaliser(reference, sens, trame) {
  const j = journaux.get(reference) ?? [];
  j.push({ t: new Date().toISOString(), sens, trame });
  if (j.length > 60) j.splice(0, j.length - 60);
  journaux.set(reference, j);
}

/** Trame OCPP-J entrante : validation de forme, puis CALL → traitement, CALLRESULT/CALLERROR → réponse attendue. */
async function traiterTrame(reference, ws, entree, raw, binaire) {
  let trame;
  try {
    if (binaire) throw new Error('trame binaire');
    trame = JSON.parse(raw.toString());
    journaliser(reference, 'entrant', trame);
  } catch {
    await versLaravel('/erreur', { reference, message: 'Trame JSON invalide' });
    return;
  }

  const idValide = Array.isArray(trame) && typeof trame[1] === 'string' && trame[1].length > 0 && trame[1].length <= 36;
  if (!Array.isArray(trame) || !idValide || ![CALL, CALLRESULT, CALLERROR].includes(trame[0])) {
    if (idValide) envoyer(ws, [CALLERROR, trame[1], 'FormationViolation', 'Trame OCPP-J mal formée', {}]);
    await versLaravel('/erreur', { reference, message: 'Trame OCPP-J mal formée' });
    return;
  }

  const [type, messageId] = trame;

  if (type === CALLRESULT || type === CALLERROR) {
    const resolve = entree.pending.get(messageId);
    if (!resolve) return;
    entree.pending.delete(messageId);
    if (type === CALLRESULT) {
      resolve({ etat: 'ok', reponse: trame[2] ?? {} });
    } else {
      const code = String(trame[2] ?? 'GenericError');
      resolve({ etat: 'erreur', code, description: String(trame[3] ?? '') });
      // Fonction optionnelle absente de la borne : pas une anomalie d'exploitation.
      if (!['NotImplemented', 'NotSupported'].includes(code)) {
        await versLaravel('/erreur', { reference, message: `${code} ${trame[3] ?? ''}`.trim().slice(0, 240) });
      }
    }
    return;
  }

  const [, , action, payload] = trame;
  if (typeof action !== 'string' || payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    envoyer(ws, [CALLERROR, messageId, 'FormationViolation', 'CALL attendu : [2, id, action, {payload}]', {}]);
    return;
  }

  try {
    envoyer(ws, [CALLRESULT, messageId, await traiterAction(reference, action, payload)]);
  } catch (err) {
    const code = err instanceof ErreurOcpp ? err.code : 'InternalError';
    envoyer(ws, [CALLERROR, messageId, code, err.message.slice(0, 250), {}]);
    if (code === 'InternalError') {
      await versLaravel('/erreur', { reference, message: `${action} : ${err.message}`.slice(0, 240) });
    }
  }
}

const entier = (v) => (Number.isInteger(v) ? v : null);

async function traiterAction(reference, action, payload) {
  switch (action) {
    case 'BootNotification': {
      const { statut, corps } = await versLaravel('/boot', {
        reference,
        versionFirmware: payload.firmwareVersion ?? null,
        modele: payload.chargePointModel ?? null,
        fabricant: payload.chargePointVendor ?? null,
        numeroSerie: payload.chargePointSerialNumber ?? null,
      });
      // API injoignable : « Pending », la borne retentera son enregistrement.
      const status = statut === 0 ? 'Pending' : (corps?.status ?? 'Rejected');
      return { status, currentTime: new Date().toISOString(), interval: corps?.interval ?? 30 };
    }

    case 'Heartbeat':
      await versLaravel('/heartbeat', { reference, temperatureC: payload.customTemperature ?? null });
      return { currentTime: new Date().toISOString() };

    case 'StatusNotification':
      if (entier(payload.connectorId) === null || typeof payload.status !== 'string') {
        throw new ErreurOcpp('TypeConstraintViolation', 'connectorId et status sont requis');
      }
      await versLaravel('/status', {
        reference,
        connectorId: payload.connectorId,
        status: payload.status,
        errorCode: payload.errorCode ?? 'NoError',
        vendorErrorCode: payload.vendorErrorCode ?? null,
        info: payload.info ?? null,
      });
      return {};

    case 'Authorize': {
      if (typeof payload.idTag !== 'string') throw new ErreurOcpp('TypeConstraintViolation', 'idTag requis');
      const r = await versLaravelCorps('/authorize', { reference, idTag: payload.idTag });
      return { idTagInfo: { status: r?.status ?? 'Invalid' } };
    }

    case 'StartTransaction': {
      if (entier(payload.connectorId) === null || typeof payload.idTag !== 'string') {
        throw new ErreurOcpp('TypeConstraintViolation', 'connectorId et idTag sont requis');
      }
      // idTag = « APP-{session} » (RemoteStart depuis l'app) ou UID d'un badge RFID.
      const r = await versLaravelCorps('/start-transaction', {
        reference,
        connectorId: payload.connectorId,
        idTag: payload.idTag,
        meterStart: entier(payload.meterStart),
      });
      // transactionId = identifiant de session Laravel (unique, persistant aux redémarrages).
      return r?.sessionId
        ? { transactionId: r.sessionId, idTagInfo: { status: 'Accepted' } }
        : { transactionId: 0, idTagInfo: { status: r?.status ?? 'Invalid' } };
    }

    case 'MeterValues': {
      const sessionId = entier(payload.transactionId);
      if (!sessionId) return {}; // mesures hors transaction : non suivies
      const { indexWh, puissanceW, soc } = lireMesures(payload.meterValue);
      await versLaravel('/meter-values', {
        reference,
        sessionId,
        indexWh,
        puissanceKw: puissanceW === null ? null : Math.max(0, puissanceW) / 1000,
        pourcentageBatterie: soc === null ? null : Math.min(100, Math.max(0, Math.round(soc))),
      });
      return {};
    }

    case 'StopTransaction': {
      const sessionId = entier(payload.transactionId);
      if (sessionId) {
        await versLaravel('/stop-transaction', {
          reference,
          sessionId,
          indexWh: entier(payload.meterStop) ?? lireMesures(payload.transactionData).indexWh,
        });
      }
      return { idTagInfo: { status: 'Accepted' } };
    }

    case 'FirmwareStatusNotification':
      await versLaravel('/firmware-status', { reference, status: payload.status });
      return {};

    case 'DiagnosticsStatusNotification':
      await versLaravel('/diagnostics-status', { reference, status: payload.status });
      return {};

    case 'DataTransfer':
      return { status: 'UnknownVendorId' };

    default:
      throw new ErreurOcpp('NotImplemented', `Action ${action} non prise en charge`);
  }
}

/**
 * Envoie un CALL à une borne et attend sa réponse.
 * @returns {Promise<{etat: 'ok', reponse: object} | {etat: 'erreur', code: string, description: string} | {etat: 'hors_ligne'} | {etat: 'sans_reponse'}>}
 */
function commanderBorne(reference, action, payload) {
  const entree = bornes.get(reference);
  if (!entree || entree.ws.readyState !== entree.ws.OPEN) return Promise.resolve({ etat: 'hors_ligne' });

  const messageId = crypto.randomUUID();
  log(`➡️  ${action} → ${reference}`);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      entree.pending.delete(messageId);
      resolve({ etat: 'sans_reponse' });
    }, DELAI_COMMANDE);
    entree.pending.set(messageId, (resultat) => {
      clearTimeout(timer);
      resolve(resultat);
    });
    envoyer(entree.ws, [CALL, messageId, action, payload]);
  });
}

/** Traduit le résultat d'une commande : succès si le statut de réponse est attendu. */
function resultat(r, statutsOk, messages) {
  if (r.etat === 'hors_ligne') return { ok: false, raison: 'hors_ligne', message: 'Borne hors ligne.' };
  if (r.etat === 'sans_reponse') return { ok: false, raison: 'hors_ligne', message: 'La borne ne répond pas.' };
  if (r.etat === 'erreur') return { ok: false, raison: 'refus', message: `Erreur de la borne (${r.code}).` };
  const statut = r.reponse.status;
  return statutsOk.includes(statut)
    ? { ok: true, message: messages.ok }
    : { ok: false, raison: 'refus', message: `${messages.refus} (${statut ?? 'réponse invalide'}).` };
}

// ---------------------------------------------------------------------------
// Pilotage du simulateur de bornes SAP (github.com/SAP/e-mobility-charging-stations-simulator)
// via son serveur UI WebSocket (protocole ui0.0.1) : la borne simulée émet ensuite de vraies
// trames OCPP (Authorize, StatusNotification, StartTransaction…) vers ce serveur.
// ---------------------------------------------------------------------------

const SAP_UI_URL = process.env.SAP_UI_URL ?? 'ws://127.0.0.1:8080';
const SAP_UI_UTILISATEUR = process.env.SAP_UI_UTILISATEUR ?? '';
const SAP_UI_MOT_DE_PASSE = process.env.SAP_UI_MOT_DE_PASSE ?? '';

/**
 * Envoie une procédure au serveur UI du simulateur. `attendre` = false : on n'attend pas la fin
 * du dialogue OCPP déclenché (la borne rappelle la supervision, qui ne doit pas rester bloquée).
 */
function appelSap(procedure, pdu, attendre = true) {
  const jeton = Buffer.from(`${SAP_UI_UTILISATEUR}:${SAP_UI_MOT_DE_PASSE}`).toString('base64').replace(/=+$/, '');
  const protocoles = SAP_UI_UTILISATEUR ? ['ui0.0.1', `authorization.basic.${jeton}`] : ['ui0.0.1'];
  return new Promise((resolve) => {
    const ws = new WebSocket(SAP_UI_URL, protocoles);
    const id = crypto.randomUUID();
    const fin = (r) => {
      clearTimeout(minuterie);
      resolve(r);
      ws.terminate();
    };
    const minuterie = setTimeout(() => fin({ status: 'failure', erreur: 'Simulateur SAP injoignable' }), DELAI_COMMANDE);
    ws.on('open', () => {
      ws.send(JSON.stringify([id, procedure, pdu]), () => {
        if (!attendre) setTimeout(() => fin({ status: 'success', envoye: true }), 300);
      });
    });
    ws.on('message', (m) => {
      try {
        const [rid, reponse] = JSON.parse(m.toString());
        if (rid === id) fin(reponse);
      } catch {
        // Diffusion du simulateur sans rapport avec la demande.
      }
    });
    ws.on('error', () => fin({ status: 'failure', erreur: 'Simulateur SAP injoignable' }));
    ws.on('close', () => fin({ status: 'failure', erreur: 'Connexion au simulateur fermée' }));
  });
}

/** Borne simulée correspondant à une référence Volteo (chargingStationId). */
async function stationSap(reference) {
  const r = await appelSap('listChargingStations', {});
  const station = (r.chargingStations ?? []).find((s) => s.stationInfo?.chargingStationId === reference);
  if (!station) throw new Error(r.erreur ?? `La borne ${reference} n'est pas simulée.`);
  return station;
}

const simulateur = {
  '/simulateur/etat': async ({ reference }) => {
    const s = await stationSap(reference);
    return {
      ok: true,
      message: 'État de la borne simulée.',
      donnees: {
        connectee: bornes.has(reference),
        connecteurs: (s.connectors ?? [])
          .filter((c) => c.connectorId > 0)
          .map((c) => ({
            id: c.connectorId,
            statut: c.connectorStatus?.status ?? null,
            transactionId: c.connectorStatus?.transactionId ?? null,
            enCharge: !!c.connectorStatus?.transactionStarted,
            idTag: c.connectorStatus?.transactionIdTag ?? null,
          })),
      },
    };
  },
  // Le client présente son badge au lecteur RFID de la borne : Authorize.req.
  '/simulateur/badge': async ({ reference, idTag }) => {
    const s = await stationSap(reference);
    const r = await appelSap('authorize', { hashIds: [s.stationInfo.hashId], idTag }, false);
    return { ok: r.status === 'success', message: r.status === 'success' ? 'Badge présenté.' : (r.erreur ?? 'Badge non lu.'), donnees: r };
  },
  // Câble branché sur le véhicule : StatusNotification « Preparing ».
  '/simulateur/brancher': async ({ reference, connecteurId }) => {
    const s = await stationSap(reference);
    const r = await appelSap('statusNotification', { hashIds: [s.stationInfo.hashId], connectorId: connecteurId, errorCode: 'NoError', status: 'Preparing' }, false);
    return { ok: r.status === 'success', message: 'Câble branché.', donnees: r };
  },
  '/simulateur/demarrer': async ({ reference, connecteurId, idTag }) => {
    const s = await stationSap(reference);
    const r = await appelSap('startTransaction', { hashIds: [s.stationInfo.hashId], connectorId: connecteurId, idTag }, false);
    return { ok: r.status === 'success', message: r.status === 'success' ? 'Transaction démarrée.' : 'Démarrage refusé.', donnees: r };
  },
  '/simulateur/arreter': async ({ reference, transactionId }) => {
    const s = await stationSap(reference);
    const r = await appelSap('stopTransaction', { hashIds: [s.stationInfo.hashId], transactionId }, false);
    return { ok: r.status === 'success', message: 'Transaction arrêtée.', donnees: r };
  },
  '/simulateur/journal': async ({ reference }) => ({ ok: true, message: 'Journal OCPP.', donnees: journaux.get(reference) ?? [] }),
};

// ---------------------------------------------------------------------------
// Serveur HTTP de commandes (côté backend Laravel, écoute locale uniquement)
// ---------------------------------------------------------------------------

const commandes = {
  '/commands/remote-start': async ({ reference, connecteurId, sessionId, idTag }) =>
    resultat(
      await commanderBorne(reference, 'RemoteStartTransaction', {
        idTag: idTag ?? `APP-${sessionId}`,
        connectorId: connecteurId,
      }),
      ['Accepted'],
      { ok: 'Recharge lancée sur la borne.', refus: 'La borne a refusé le démarrage' },
    ),
  '/commands/remote-stop': async ({ reference, sessionId }) =>
    resultat(await commanderBorne(reference, 'RemoteStopTransaction', { transactionId: sessionId }), ['Accepted'], {
      ok: 'Arrêt demandé à la borne.',
      refus: "La borne a refusé l'arrêt",
    }),
  '/commands/reset': async ({ reference, type = 'Soft' }) =>
    resultat(await commanderBorne(reference, 'Reset', { type }), ['Accepted'], {
      ok: `Reset ${type === 'Hard' ? 'matériel' : 'logiciel'} accepté par la borne.`,
      refus: 'Reset refusé par la borne',
    }),
  '/commands/unlock': async ({ reference, connecteurId }) =>
    resultat(await commanderBorne(reference, 'UnlockConnector', { connectorId: connecteurId }), ['Unlocked'], {
      ok: 'Connecteur déverrouillé.',
      refus: 'Déverrouillage refusé',
    }),
  '/commands/charging-limit': async ({ reference, connecteurId, limiteW }) => {
    // limiteW = null → reprise (ClearChargingProfile), sinon SetChargingProfile (0 = pause).
    const r =
      limiteW == null
        ? await commanderBorne(reference, 'ClearChargingProfile', { id: 1, connectorId: connecteurId })
        : await commanderBorne(reference, 'SetChargingProfile', {
            connectorId: connecteurId,
            csChargingProfiles: {
              chargingProfileId: 1,
              stackLevel: 1,
              chargingProfilePurpose: 'TxProfile',
              chargingProfileKind: 'Relative',
              chargingSchedule: {
                chargingRateUnit: 'W',
                chargingSchedulePeriod: [{ startPeriod: 0, limit: limiteW }],
              },
            },
          });
    return resultat(r, ['Accepted'], {
      ok: limiteW == null ? 'Limite levée.' : `Puissance limitée à ${limiteW / 1000} kW.`,
      refus: 'Profil de charge refusé',
    });
  },
  '/commands/change-configuration': async ({ reference, key, value }) => {
    const r = await commanderBorne(reference, 'ChangeConfiguration', { key, value });
    const res = resultat(r, ['Accepted', 'RebootRequired'], {
      ok: r.reponse?.status === 'RebootRequired' ? `Paramètre ${key} modifié — redémarrage requis.` : `Paramètre ${key} modifié.`,
      refus: `Modification de ${key} refusée`,
    });
    return res;
  },
  '/commands/get-configuration': async ({ reference }) => {
    const r = await commanderBorne(reference, 'GetConfiguration', {});
    if (r.etat !== 'ok') return resultat(r, [], { ok: '', refus: 'Lecture refusée' });
    const cles = Array.isArray(r.reponse.configurationKey) ? r.reponse.configurationKey : [];
    return { ok: true, message: `${cles.length} paramètre(s) lus.`, donnees: cles };
  },
  '/commands/update-firmware': async ({ reference, location, retrieveDate }) => {
    const r = await commanderBorne(reference, 'UpdateFirmware', { location, retrieveDate, retries: 2 });
    // UpdateFirmware.conf n'a pas de statut : une réponse vaut acceptation.
    return r.etat === 'ok' ? { ok: true, message: 'Mise à jour transmise à la borne.' } : resultat(r, [], { ok: '', refus: 'Mise à jour refusée' });
  },
  '/commands/get-diagnostics': async ({ reference, location }) => {
    const r = await commanderBorne(reference, 'GetDiagnostics', { location });
    if (r.etat !== 'ok') return resultat(r, [], { ok: '', refus: 'Diagnostic refusé' });
    return r.reponse.fileName
      ? { ok: true, message: `Diagnostic ${r.reponse.fileName} en cours d'envoi.` }
      : { ok: false, raison: 'refus', message: 'Aucun diagnostic disponible.' };
  },
};

function lireCorps(req) {
  return new Promise((resolve, reject) => {
    let corps = '';
    req.on('data', (chunk) => {
      corps += chunk;
      if (corps.length > TAILLE_MAX) {
        reject(new Error('Requête trop volumineuse'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(corps));
    req.on('error', reject);
  });
}

function secretValide(fourni) {
  const a = Buffer.from(String(fourni ?? ''));
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

http
  .createServer(async (req, res) => {
    const repondre = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (!secretValide(req.headers['x-ocpp-secret'])) return repondre(401, { message: 'Secret invalide' });

    if (req.method === 'GET' && req.url === '/status') {
      return repondre(200, { bornesConnectees: [...bornes.keys()], clientsTempsReel: clients.size });
    }

    try {
      const corps = JSON.parse((await lireCorps(req)) || '{}');

      if (req.method === 'POST' && req.url === '/broadcast') {
        diffuser(corps.evenement, corps.donnees);
        return repondre(200, { message: 'Diffusé', clients: clients.size });
      }

      const commande = commandes[req.url ?? ''] ?? simulateur[req.url ?? ''];
      if (req.method !== 'POST' || !commande) return repondre(404, { message: 'Commande inconnue' });

      const r = await commande(corps);
      repondre(r.ok ? 200 : 502, { message: r.message, donnees: r.donnees ?? null, raison: r.raison ?? null });
    } catch (err) {
      repondre(400, { message: err.message });
    }
  })
  .listen(HTTP_PORT, HTTP_HOST);

// ---------------------------------------------------------------------------
// Relais temps réel vers le back-office et l'app (module 4)
// ---------------------------------------------------------------------------

/** ws -> { userId, personnel } */
const clients = new Map();

const live = new WebSocketServer({ port: LIVE_PORT, maxPayload: 64 * 1024 });

live.on('connection', async (ws, req) => {
  const token = new URL(req.url ?? '/', 'http://x').searchParams.get('token');
  // Authentification : le jeton Sanctum est vérifié auprès de Laravel.
  let user = null;
  try {
    const res = await fetch(`${LARAVEL_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    user = res.ok ? await res.json() : null;
  } catch {
    user = null;
  }
  if (!user) {
    ws.close(4401, 'Non authentifié');
    return;
  }

  clients.set(ws, { userId: user.id, personnel: user.role !== 'client' });
  envoyer(ws, { evenement: 'connecte', donnees: { bornesConnectees: [...bornes.keys()] } });

  // Keep-alive pour les proxys.
  const ping = setInterval(() => ws.readyState === ws.OPEN && ws.ping(), 25000);
  ws.on('close', () => {
    clients.delete(ws);
    clearInterval(ping);
  });
  ws.on('error', () => ws.terminate());
});

function diffuser(evenement, donnees = {}) {
  const message = JSON.stringify({ evenement, donnees });
  for (const [ws, client] of clients) {
    if (ws.readyState !== ws.OPEN) continue;
    // Un client ne reçoit que ses propres sessions ; le personnel reçoit tout.
    const pourClient =
      evenement === 'borne.maj' || (evenement === 'session.maj' && donnees.userId === client.userId);
    if (client.personnel || pourClient) ws.send(message);
  }
}

// ---------------------------------------------------------------------------
// Démarrage et arrêt propre
// ---------------------------------------------------------------------------

process.on('unhandledRejection', (err) => log('⚠️ Promesse rejetée :', err?.message ?? err));

let arretEnCours = false;
async function arreter(signal) {
  if (arretEnCours) return;
  arretEnCours = true;
  log(`${signal} reçu : fermeture des connexions des bornes…`);
  // Les bornes vont perdre la connexion : leur état passe « déconnectée » tout de suite.
  await Promise.allSettled([...bornes.keys()].map((reference) => versLaravel('/deconnexion', { reference })));
  for (const entree of bornes.values()) {
    entree.remplacee = true;
    entree.ws.close(1001, 'Arrêt du serveur');
  }
  process.exit(0);
}
process.on('SIGINT', () => void arreter('SIGINT'));
process.on('SIGTERM', () => void arreter('SIGTERM'));

serveurOcpp.listen(OCPP_PORT);

log(`⚡ Serveur OCPP 1.6J : ws://0.0.0.0:${OCPP_PORT}/ocpp/{reference} (HTTP Basic, Security Profile 1)`);
log(`🛠  API commandes    : http://${HTTP_HOST}:${HTTP_PORT}`);
log(`📡 Temps réel       : ws://0.0.0.0:${LIVE_PORT}/live?token=…`);
