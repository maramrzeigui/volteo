/**
 * Pont Volteo ↔ blockchain.
 *
 * Petit serveur HTTP local appelé par l'API Laravel. Il garde les portefeuilles des acteurs
 * (fabricants, stations, conducteurs) et signe les transactions pour eux : personne n'a besoin
 * de MetaMask. Protégé par un secret partagé (en-tête X-Pont-Secret), il n'écoute qu'en local.
 *
 * Variables : RPC_URL (http://127.0.0.1:8545), PONT_PORT (9400), PONT_SECRET, ADMIN_PRIVATE_KEY
 * (par défaut le compte n°0 du réseau Hardhat local), DEPLOIEMENT (deployments/localhost.json).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PORT = Number(process.env.PONT_PORT || 9400);
const SECRET = process.env.PONT_SECRET || "secret-blockchain-dev";
// Compte n°0 public du réseau Hardhat local (aucune valeur réelle) : à remplacer hors développement.
const ADMIN_KEY = process.env.ADMIN_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEPLOIEMENT = process.env.DEPLOIEMENT || path.join(__dirname, "deployments", "localhost.json");
const PORTEFEUILLES = path.join(__dirname, "data", "portefeuilles.json");

const ABI_PASSPORT = [
  "function FABRICANT() view returns (bytes32)",
  "function hasRole(bytes32,address) view returns (bool)",
  "function grantRole(bytes32,address)",
  "function enregistrerBatterie(string,string,string,uint16,string) returns (uint256)",
  "function transfererPropriete(string,address)",
  "function tokenIdDe(string) view returns (uint256)",
  "function fiche(string) view returns (uint256 tokenId, tuple(string numSerie,string modele,string chimie,uint16 capaciteKWh,string vin,uint8 soh,uint64 energieTotaleWh,uint32 nbRecharges,bool recyclee,uint64 dateFabrication,address fabricant) infos, address proprietaire)",
  "function interventions(string) view returns (tuple(string typeIntervention,string description,address garage,uint64 date)[])",
  "function cyclesCentiemes(string) view returns (uint256)",
  "event BatterieEnregistree(uint256 indexed tokenId, string numSerie, address indexed fabricant)",
];
const ABI_LEDGER = [
  "function STATION() view returns (bytes32)",
  "function hasRole(bytes32,address) view returns (bool)",
  "function agreerStation(address,string)",
  "function enregistrerRecharge(string,string,string,uint64,uint32,uint64,uint64)",
  "function recharges(string) view returns (tuple(string sessionId,string idBorne,uint64 energieWh,uint32 puissanceMaxW,uint64 debut,uint64 fin,address station)[])",
  "function nomStation(address) view returns (string)",
];

const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { staticNetwork: true, cacheTimeout: -1 });
const admin = new ethers.NonceManager(new ethers.Wallet(ADMIN_KEY, provider));

function deploiement() {
  if (!fs.existsSync(DEPLOIEMENT)) throw erreur(503, "Contrats non déployés : lancez « npm run deployer ».");
  return JSON.parse(fs.readFileSync(DEPLOIEMENT, "utf8"));
}

// ------------------------------------------------------------------ portefeuilles

function lirePortefeuilles() {
  return fs.existsSync(PORTEFEUILLES) ? JSON.parse(fs.readFileSync(PORTEFEUILLES, "utf8")) : {};
}

function ecrirePortefeuilles(p) {
  fs.mkdirSync(path.dirname(PORTEFEUILLES), { recursive: true });
  fs.writeFileSync(PORTEFEUILLES, JSON.stringify(p, null, 2), { mode: 0o600 });
}

const signataires = new Map();
function signataire(ref) {
  const cle = lirePortefeuilles()[ref];
  if (!cle) throw erreur(404, `Portefeuille inconnu : ${ref}`);
  if (!signataires.has(ref)) signataires.set(ref, new ethers.NonceManager(new ethers.Wallet(cle, provider)));
  return signataires.get(ref);
}

/** Crée le portefeuille d'un acteur (s'il n'existe pas) et l'approvisionne en ETH de test pour payer le gas. */
async function assurerPortefeuille(ref) {
  const p = lirePortefeuilles();
  if (!p[ref]) {
    p[ref] = ethers.Wallet.createRandom().privateKey;
    ecrirePortefeuilles(p);
  }
  const adresse = new ethers.Wallet(p[ref]).address;
  if ((await provider.getBalance(adresse)) < ethers.parseEther("1")) {
    await (await admin.sendTransaction({ to: adresse, value: ethers.parseEther("10") })).wait();
  }
  return adresse;
}

// Les transactions passent une par une : pas de conflit de nonce entre deux appels simultanés.
let file = Promise.resolve();
function enFile(tache) {
  const resultat = file.then(tache, tache);
  file = resultat.catch(() => undefined);
  return resultat;
}

/**
 * Simule d'abord l'appel (refus du smart contract lisible, aucun nonce consommé), puis l'envoie.
 * En cas d'échec, le compteur de nonce du signataire est resynchronisé avec la chaîne.
 */
async function envoyer(contrat, methode, args) {
  try {
    await contrat[methode].staticCall(...args);
  } catch (e) {
    throw erreur(422, raison(e));
  }
  try {
    return await (await contrat[methode](...args)).wait();
  } catch (e) {
    contrat.runner.reset?.();
    throw e;
  }
}

// ------------------------------------------------------------------ actions

const actions = {
  "GET /etat": async () => {
    const d = deploiement();
    return { ...d, bloc: await provider.getBlockNumber() };
  },

  "POST /portefeuilles": ({ corps }) =>
    enFile(async () => {
      const { ref, role, nom } = corps;
      if (!ref) throw erreur(422, "ref requis");
      const adresse = await assurerPortefeuille(ref);
      const d = deploiement();
      if (role === "fabricant") {
        const passport = new ethers.Contract(d.batteryPassport, ABI_PASSPORT, admin);
        const r = await passport.FABRICANT();
        if (!(await passport.hasRole(r, adresse))) await (await passport.grantRole(r, adresse)).wait();
      } else if (role === "station") {
        const ledger = new ethers.Contract(d.chargeLedger, ABI_LEDGER, admin);
        if (!(await ledger.hasRole(await ledger.STATION(), adresse))) await (await ledger.agreerStation(adresse, nom || ref)).wait();
      }
      return { ref, adresse };
    }),

  "POST /batteries": ({ corps }) =>
    enFile(async () => {
      const { fabricant, numSerie, modele, chimie, capaciteKWh, vin } = corps;
      const passport = new ethers.Contract(deploiement().batteryPassport, ABI_PASSPORT, signataire(fabricant));
      const recu = await envoyer(passport, "enregistrerBatterie", [numSerie, modele || "", chimie || "", capaciteKWh, vin || ""]);
      const evt = recu.logs.map((l) => { try { return passport.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "BatterieEnregistree");
      return { tokenId: Number(evt.args.tokenId), tx: recu.hash, bloc: recu.blockNumber };
    }),

  "POST /batteries/transfert": ({ corps }) =>
    enFile(async () => {
      const { de, numSerie, vers } = corps;
      const destination = ethers.isAddress(vers) ? vers : await assurerPortefeuille(vers);
      const passport = new ethers.Contract(deploiement().batteryPassport, ABI_PASSPORT, signataire(de));
      const recu = await envoyer(passport, "transfererPropriete", [numSerie, destination]);
      return { tx: recu.hash, bloc: recu.blockNumber, proprietaire: destination };
    }),

  "POST /recharges": ({ corps }) =>
    enFile(async () => {
      const { station, numSerie, sessionId, idBorne, energieWh, puissanceMaxW, debut, fin } = corps;
      const ledger = new ethers.Contract(deploiement().chargeLedger, ABI_LEDGER, signataire(station));
      const recu = await envoyer(ledger, "enregistrerRecharge", [numSerie, sessionId, idBorne, energieWh, puissanceMaxW, debut, fin]);
      return { tx: recu.hash, bloc: recu.blockNumber };
    }),

  "GET /batteries/:numSerie": async ({ params }) => {
    const d = deploiement();
    const passport = new ethers.Contract(d.batteryPassport, ABI_PASSPORT, provider);
    const ledger = new ethers.Contract(d.chargeLedger, ABI_LEDGER, provider);
    if ((await passport.tokenIdDe(params.numSerie)) === 0n) throw erreur(404, "Batterie inconnue dans la blockchain");

    const [tokenId, b, proprietaire] = await passport.fiche(params.numSerie);
    const [interventions, recharges, cycles] = await Promise.all([
      passport.interventions(params.numSerie),
      ledger.recharges(params.numSerie),
      passport.cyclesCentiemes(params.numSerie),
    ]);
    const noms = {};
    for (const r of recharges) if (!(r.station in noms)) noms[r.station] = await ledger.nomStation(r.station);

    return {
      contrat: d.batteryPassport,
      tokenId: Number(tokenId),
      proprietaire,
      numSerie: b.numSerie,
      modele: b.modele,
      chimie: b.chimie,
      capaciteKWh: Number(b.capaciteKWh),
      vin: b.vin,
      soh: Number(b.soh),
      energieTotaleKWh: Number(b.energieTotaleWh) / 1000,
      nbRecharges: Number(b.nbRecharges),
      cycles: Number(cycles) / 100,
      recyclee: b.recyclee,
      fabricant: b.fabricant,
      dateFabrication: new Date(Number(b.dateFabrication) * 1000).toISOString(),
      interventions: interventions.map((i) => ({
        type: i.typeIntervention, description: i.description, garage: i.garage, date: new Date(Number(i.date) * 1000).toISOString(),
      })),
      recharges: recharges.map((r) => ({
        sessionId: r.sessionId, borne: r.idBorne, energieKWh: Number(r.energieWh) / 1000,
        debut: new Date(Number(r.debut) * 1000).toISOString(), fin: new Date(Number(r.fin) * 1000).toISOString(),
        station: r.station, nomStation: noms[r.station],
      })),
    };
  },
};

// ------------------------------------------------------------------ serveur

function erreur(statut, message) {
  return Object.assign(new Error(message), { statut });
}

function trouver(methode, chemin) {
  for (const [cle, action] of Object.entries(actions)) {
    const [m, modele] = cle.split(" ");
    if (m !== methode) continue;
    const a = modele.split("/"), b = chemin.split("/");
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((s, i) => (s.startsWith(":") ? ((params[s.slice(1)] = decodeURIComponent(b[i])), true) : s === b[i]))) return { action, params };
  }
  return null;
}

/** Message lisible d'un refus du smart contract (require). */
function raison(e) {
  return e.statut ? e.message : e.reason || e.revert?.args?.[0] || e.shortMessage || e.message;
}

http
  .createServer((req, res) => {
    const repondre = (statut, donnees) => {
      res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(donnees));
    };
    if (req.headers["x-pont-secret"] !== SECRET) return repondre(401, { message: "Secret invalide" });

    let brut = "";
    req.on("data", (c) => (brut += c));
    req.on("end", async () => {
      const route = trouver(req.method, new URL(req.url, "http://x").pathname);
      if (!route) return repondre(404, { message: "Route inconnue" });
      try {
        repondre(200, await route.action({ corps: brut ? JSON.parse(brut) : {}, params: route.params }));
      } catch (e) {
        repondre(e.statut || 422, { message: raison(e) });
      }
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`Pont blockchain Volteo sur http://127.0.0.1:${PORT} (RPC ${RPC_URL})`));
