/**
 * Simulateur de borne OCPP 1.6J pour BorneApp.
 *
 * Se connecte au serveur OCPP comme le ferait une vraie borne :
 *   BootNotification → Heartbeat (30 s, avec température) → répond aux commandes
 *   (RemoteStart/Stop, Reset, UnlockConnector, Change/GetConfiguration,
 *   SetChargingProfile / ClearChargingProfile, UpdateFirmware, GetDiagnostics)
 *   et envoie des MeterValues toutes les 5 s pendant une recharge.
 *
 * Authentification (OCPP 1.6 Security Profile 1, HTTP Basic) : identifiant =
 * référence de la borne, mot de passe = OCPP_MOT_DE_PASSE, sinon le mot de
 * passe de démonstration du seeder « demo-ocpp-{référence} ».
 * Le compteur d'énergie est cumulatif comme sur une vraie borne (meterStart ≠ 0).
 * Puissance maximale de la prise : PUISSANCE_KW (22 kW par défaut).
 *
 * Usage :
 *   node simulator.js                          # simule BRN-TUN-001
 *   node simulator.js BRN-TUN-002              # simule une autre borne
 *   node simulator.js BRN-TUN-001 BRN-SOU-001  # plusieurs bornes
 *
 * Commandes clavier (sur la première borne simulée, ou « REF commande ») :
 *   badge <UID> [prise]   présente un badge RFID (Authorize + StartTransaction)
 *   stop                  arrête la recharge depuis la borne (StopTransaction)
 *   chaud                 envoie une température de 68 °C (alerte surchauffe)
 *   porte                 signale la trappe ouverte (alerte porte ouverte)
 *   panne                 défaut matériel sur la prise 1 (GroundFailure)
 *   coupure               anomalie électrique (UnderVoltage)
 *   ok                    retour à la normale
 *   aide                  liste des commandes
 */
import readline from 'node:readline';
import WebSocket from 'ws';

const SERVEUR = process.env.OCPP_URL ?? 'ws://127.0.0.1:9220';
const PUISSANCE_MAX_W = Number(process.env.PUISSANCE_KW ?? 22) * 1000;
const motDePasse = (reference) => process.env.OCPP_MOT_DE_PASSE ?? `demo-ocpp-${reference}`;
const references = process.argv.slice(2);
if (references.length === 0) references.push('BRN-TUN-001');

const CALL = 2;
const CALLRESULT = 3;

const simulateurs = new Map();

function simulerBorne(reference) {
  const log = (...a) => console.log(`[${reference}]`, ...a);

  let ws = null;
  let compteur = 0;
  const pending = new Map();
  let recharge = null; // { transactionId, connecteur, indexDebutWh, soc, limiteW, timer }
  // Index du compteur d'énergie (Wh), cumulatif sur la vie de la borne.
  let compteurWh = 1_000_000 + Math.floor(Math.random() * 500_000);
  let fermetureVoulue = false;
  let heartbeat = null;
  let temperature = 30 + Math.random() * 6;
  // Version annoncée au BootNotification : inconnue tant qu'aucune mise à jour n'a eu lieu
  // (la version enregistrée dans le back-office est alors conservée).
  let firmware = process.env.FIRMWARE ?? null;
  const configuration = {
    HeartbeatInterval: '30',
    MeterValueSampleInterval: '5',
    ConnectionTimeOut: '60',
    LocalAuthorizeOffline: 'true',
    AuthorizeRemoteTxRequests: 'false',
    NumberOfConnectors: '2',
  };

  const call = (action, payload) =>
    new Promise((resolve) => {
      if (ws?.readyState !== WebSocket.OPEN) return resolve({});
      const id = `m${++compteur}`;
      pending.set(id, resolve);
      ws.send(JSON.stringify([CALL, id, action, payload]));
    });

  const statut = (connectorId, status, errorCode = 'NoError', extra = {}) =>
    call('StatusNotification', { connectorId, status, errorCode, timestamp: new Date().toISOString(), ...extra });

  const envoyerMesures = async () => {
    // Copie locale : la recharge peut être arrêtée (RemoteStop, badge) pendant l'envoi.
    const r = recharge;
    if (!r) return;
    const enPause = r.limiteW === 0;
    // Puissance proche du maximum de la prise, qui décroît en fin de charge (courbe CC/CV).
    const courbe = r.soc < 80 ? 1 : Math.max(0.25, 1 - (r.soc - 80) / 26);
    const bruit = 0.94 + Math.random() * 0.05;
    const puissanceW = enPause ? 0 : Math.round(Math.min(r.limiteW ?? Infinity, PUISSANCE_MAX_W * courbe * bruit));
    // énergie (Wh) ajoutée pendant l'intervalle à cette puissance
    compteurWh += Math.round((puissanceW * Number(configuration.MeterValueSampleInterval)) / 3600);
    if (!enPause) r.soc = Math.min(100, r.soc + 0.2);
    await call('MeterValues', {
      connectorId: r.connecteur,
      transactionId: r.transactionId,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [
            { value: String(compteurWh), measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
            { value: String(puissanceW), measurand: 'Power.Active.Import', unit: 'W' },
            { value: String(Math.floor(r.soc)), measurand: 'SoC', unit: 'Percent' },
          ],
        },
      ],
    });
    if (recharge === r && r.soc >= 100) {
      log('🔋 Batterie pleine, fin de recharge');
      await arreterRecharge('EVDisconnected');
    }
  };

  const demarrerRecharge = async (idTag, connecteur = 1) => {
    if (recharge) {
      log('⚠️  Une recharge est déjà en cours');
      return false;
    }
    await statut(connecteur, 'Preparing');
    const reponse = await call('StartTransaction', {
      connectorId: connecteur,
      idTag,
      meterStart: compteurWh,
      timestamp: new Date().toISOString(),
    });
    if (reponse.idTagInfo?.status !== 'Accepted' || !reponse.transactionId) {
      log(`⛔ Recharge refusée (${reponse.idTagInfo?.status ?? 'sans réponse'})`);
      await statut(connecteur, 'Available');
      return false;
    }
    recharge = {
      transactionId: reponse.transactionId,
      connecteur,
      indexDebutWh: compteurWh,
      soc: 40 + Math.floor(Math.random() * 20),
      limiteW: null,
    };
    log(`🔋 Recharge démarrée (transaction ${reponse.transactionId}, prise ${connecteur})`);
    await statut(connecteur, 'Charging');
    recharge.timer = setInterval(envoyerMesures, Number(configuration.MeterValueSampleInterval) * 1000);
    return true;
  };

  const arreterRecharge = async (raison = 'Remote') => {
    if (!recharge) return;
    const { timer, transactionId, indexDebutWh, connecteur } = recharge;
    const energieWh = compteurWh - indexDebutWh;
    clearInterval(timer);
    recharge = null;
    await call('StopTransaction', {
      transactionId,
      meterStop: compteurWh,
      timestamp: new Date().toISOString(),
      reason: raison,
    });
    log(`🛑 Recharge arrêtée (${(energieWh / 1000).toFixed(2)} kWh)`);
    await statut(connecteur, 'Finishing');
    await statut(connecteur, 'Available');
  };

  const demarrerHeartbeat = () => {
    clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      temperature += (Math.random() - 0.5) * 1.5 + (recharge ? 0.3 : -0.2);
      temperature = Math.max(22, Math.min(temperature, 59));
      call('Heartbeat', { customTemperature: Math.round(temperature * 10) / 10 });
    }, Number(configuration.HeartbeatInterval) * 1000);
  };

  /** Mise à jour firmware simulée : téléchargement réel du binaire puis installation. */
  const mettreAJour = async (location) => {
    try {
      await call('FirmwareStatusNotification', { status: 'Downloading' });
      const res = await fetch(location);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const taille = (await res.arrayBuffer()).byteLength;
      log(`📦 Firmware téléchargé (${taille} octets)`);
      await call('FirmwareStatusNotification', { status: 'Downloaded' });
      await new Promise((r) => setTimeout(r, 2000));
      await call('FirmwareStatusNotification', { status: 'Installing' });
      await new Promise((r) => setTimeout(r, 3000));
      // La version cible est transmise dans l'URL signée (?version=x.y.z).
      firmware = new URL(location).searchParams.get('version') ?? firmware;
      await call('FirmwareStatusNotification', { status: 'Installed' });
      log(`✅ Firmware ${firmware} installé — redémarrage`);
      redemarrer();
    } catch (e) {
      log(`❌ Échec de la mise à jour : ${e.message}`);
      await call('FirmwareStatusNotification', { status: 'DownloadFailed' });
    }
  };

  const envoyerDiagnostics = async (location) => {
    await call('DiagnosticsStatusNotification', { status: 'Uploading' });
    const contenu = [
      `Diagnostic ${reference} — ${new Date().toISOString()}`,
      `Firmware : ${firmware ?? 'inconnu'}`,
      `Température : ${temperature.toFixed(1)} °C`,
      `Recharge en cours : ${recharge ? `oui (${compteurWh - recharge.indexDebutWh} Wh)` : 'non'}`,
      'Configuration :',
      ...Object.entries(configuration).map(([k, v]) => `  ${k} = ${v}`),
    ].join('\n');
    try {
      const res = await fetch(location, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: contenu });
      await call('DiagnosticsStatusNotification', { status: res.ok ? 'Uploaded' : 'UploadFailed' });
      log(res.ok ? '📤 Diagnostic envoyé' : `❌ Envoi du diagnostic refusé (${res.status})`);
    } catch (e) {
      await call('DiagnosticsStatusNotification', { status: 'UploadFailed' });
      log(`❌ Envoi du diagnostic impossible : ${e.message}`);
    }
  };

  const repondre = (id, payload) => ws.send(JSON.stringify([CALLRESULT, id, payload]));

  const connecter = () => {
    fermetureVoulue = false;
    ws = new WebSocket(`${SERVEUR}/ocpp/${reference}`, ['ocpp1.6'], {
      headers: { Authorization: `Basic ${Buffer.from(`${reference}:${motDePasse(reference)}`).toString('base64')}` },
    });

    ws.on('unexpected-response', (_req, res) => {
      log(res.statusCode === 401 ? '⛔ Authentification OCPP refusée (mot de passe ?)' : `⛔ Connexion refusée (HTTP ${res.statusCode})`);
    });

    ws.on('open', async () => {
      log(`connectée à ${SERVEUR}${firmware ? ` (firmware ${firmware})` : ''}`);
      await call('BootNotification', {
        chargePointVendor: 'BorneApp Simulateur',
        chargePointModel: 'SIM-1',
        chargePointSerialNumber: `SIM-${reference}`,
        ...(firmware ? { firmwareVersion: firmware } : {}),
      });
      await statut(0, 'Available');
      for (let prise = 1; prise <= Number(configuration.NumberOfConnectors); prise++) await statut(prise, 'Available');
      demarrerHeartbeat();
    });

    ws.on('message', async (raw) => {
      let trame;
      try {
        trame = JSON.parse(raw.toString());
      } catch {
        return log('⚠️  Trame illisible reçue');
      }
      if (!Array.isArray(trame)) return;
      const [type, id, actionOuPayload, payload] = trame;

      if (type === 4) {
        log(`⚠️  Erreur du serveur : ${actionOuPayload} ${payload ?? ''}`);
        pending.get(id)?.({});
        pending.delete(id);
        return;
      }

      if (type === CALLRESULT) {
        pending.get(id)?.(actionOuPayload);
        pending.delete(id);
        return;
      }
      if (type !== CALL) return;
      const action = actionOuPayload;

      switch (action) {
        case 'RemoteStartTransaction':
          repondre(id, { status: recharge ? 'Rejected' : 'Accepted' });
          if (!recharge) await demarrerRecharge(payload.idTag, payload.connectorId ?? 1);
          break;
        case 'RemoteStopTransaction':
          repondre(id, { status: recharge ? 'Accepted' : 'Rejected' });
          await arreterRecharge('Remote');
          break;
        case 'Reset':
          repondre(id, { status: 'Accepted' });
          log(`♻️  Reset ${payload.type} demandé`);
          await arreterRecharge(payload.type === 'Hard' ? 'HardReset' : 'SoftReset');
          redemarrer();
          break;
        case 'UnlockConnector':
          repondre(id, { status: recharge?.connecteur === payload.connectorId ? 'UnlockFailed' : 'Unlocked' });
          break;
        case 'ChangeConfiguration':
          if (!(payload.key in configuration)) {
            repondre(id, { status: 'NotSupported' });
          } else {
            configuration[payload.key] = String(payload.value);
            repondre(id, { status: payload.key === 'NumberOfConnectors' ? 'RebootRequired' : 'Accepted' });
            if (payload.key === 'HeartbeatInterval') demarrerHeartbeat();
            log(`⚙️  ${payload.key} = ${payload.value}`);
          }
          break;
        case 'GetConfiguration':
          repondre(id, {
            configurationKey: Object.entries(configuration).map(([key, value]) => ({ key, value, readonly: key === 'NumberOfConnectors' })),
            unknownKey: [],
          });
          break;
        case 'SetChargingProfile': {
          const limite = payload.csChargingProfiles?.chargingSchedule?.chargingSchedulePeriod?.[0]?.limit;
          if (!recharge) {
            repondre(id, { status: 'Rejected' });
            break;
          }
          repondre(id, { status: 'Accepted' });
          recharge.limiteW = limite ?? null;
          log(limite === 0 ? '⏸  Recharge en pause' : `📉 Puissance limitée à ${limite} W`);
          await statut(recharge.connecteur, limite === 0 ? 'SuspendedEVSE' : 'Charging');
          break;
        }
        case 'ClearChargingProfile':
          repondre(id, { status: recharge ? 'Accepted' : 'Unknown' });
          if (recharge) {
            recharge.limiteW = null;
            log('▶️  Recharge reprise');
            await statut(recharge.connecteur, 'Charging');
          }
          break;
        case 'TriggerMessage': {
          // Le serveur demande l'état courant (reconnexion) : on renvoie les messages demandés.
          const demande = payload.requestedMessage;
          const pris = ['StatusNotification', 'Heartbeat', 'BootNotification', 'MeterValues'].includes(demande);
          repondre(id, { status: pris ? 'Accepted' : 'NotImplemented' });
          if (demande === 'StatusNotification') {
            for (let prise = 1; prise <= Number(configuration.NumberOfConnectors); prise++) {
              await statut(prise, recharge?.connecteur === prise ? 'Charging' : 'Available');
            }
          } else if (demande === 'Heartbeat') {
            await call('Heartbeat', { customTemperature: Math.round(temperature * 10) / 10 });
          } else if (demande === 'MeterValues') {
            await envoyerMesures();
          }
          break;
        }
        case 'UpdateFirmware':
          repondre(id, {});
          log('⬇️  Mise à jour firmware demandée');
          mettreAJour(payload.location);
          break;
        case 'GetDiagnostics':
          repondre(id, { fileName: `diagnostic-${reference}.log` });
          envoyerDiagnostics(payload.location);
          break;
        default:
          ws.send(JSON.stringify([4, id, 'NotImplemented', `${action} non géré par le simulateur`, {}]));
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      for (const resolve of pending.values()) resolve({});
      pending.clear();
      if (fermetureVoulue) return;
      // Comme une vraie borne : nouvelle tentative de connexion après 10 s.
      log('déconnectée — nouvelle tentative dans 10 s');
      setTimeout(connecter, 10000);
    });
    ws.on('error', (e) => log('erreur :', e.message));
  };

  const redemarrer = () => {
    clearInterval(heartbeat);
    fermetureVoulue = true;
    ws?.close();
    setTimeout(connecter, 3000);
  };

  connecter();

  // Scénarios déclenchés au clavier.
  return {
    async executer(commande, args) {
      switch (commande) {
        case 'badge': {
          const uid = args[0];
          if (!uid) return log('usage : badge <UID> [prise]');
          const { idTagInfo } = await call('Authorize', { idTag: uid });
          log(`🪪 Badge ${uid} : ${idTagInfo?.status}`);
          if (idTagInfo?.status === 'Accepted') await demarrerRecharge(uid, Number(args[1] ?? 1));
          break;
        }
        case 'stop':
          await arreterRecharge('Local');
          break;
        case 'chaud':
          temperature = 68;
          await call('Heartbeat', { customTemperature: 68 });
          log('🌡  Température : 68 °C');
          break;
        case 'porte':
          await statut(0, 'Available', 'OtherError', { vendorErrorCode: 'DoorOpen', info: 'Door open' });
          log('🚪 Trappe ouverte signalée');
          break;
        case 'panne':
          await arreterRecharge('Other');
          await statut(1, 'Faulted', 'GroundFailure');
          log('💥 Défaut d\'isolement sur la prise 1');
          break;
        case 'coupure':
          await statut(0, 'Faulted', 'UnderVoltage');
          log('⚡ Sous-tension signalée');
          break;
        case 'ok':
          temperature = 32;
          await statut(0, 'Available');
          await statut(1, 'Available');
          log('✅ Retour à la normale');
          break;
        default:
          console.log('Commandes : badge <UID> [prise] | stop | chaud | porte | panne | coupure | ok | aide');
      }
    },
  };
}

references.forEach((ref) => simulateurs.set(ref, simulerBorne(ref)));

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (ligne) => {
  const mots = ligne.trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return;
  const cible = simulateurs.has(mots[0]) ? mots.shift() : references[0];
  simulateurs.get(cible).executer(mots[0].toLowerCase(), mots.slice(1));
});
console.log('Tapez « aide » pour simuler badge RFID, surchauffe, porte ouverte, panne…');
