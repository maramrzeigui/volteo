# Volteo Chain ⛓️🔋

**Traçabilité des batteries de véhicules électriques et sécurisation de leur historique de recharge.**

Chaque batterie reçoit un **NFT** (ERC-721) créé par son fabricant : son passeport numérique.
Chaque recharge faite sur une borne Volteo est **vérifiée par un smart contract** puis inscrite pour
toujours dans l'historique de ce NFT. À la revente de la voiture, le NFT est transféré à l'acheteur
avec tout son historique, impossible à falsifier.

## Les deux smart contracts (un par étudiant du binôme)

| Contrat | Rôle |
|---|---|
| [`BatteryPassport.sol`](contracts/BatteryPassport.sol) — **étudiant 1** | NFT de la batterie : création par un fabricant agréé, transfert de propriété (vente), installation sur un véhicule (VIN), interventions et état de santé (garage agréé), recyclage (NFT bloqué). |
| [`ChargeLedger.sol`](contracts/ChargeLedger.sol) — **étudiant 2** | Registre des recharges : seules les stations agréées par Volteo écrivent ; refus des doublons, des énergies impossibles (`énergie × 3600 ≤ puissance × durée`) et des batteries recyclées ; ajout de l'énergie au NFT. |

Les recharges ne sont **pas** des NFT : ce sont des enregistrements rattachés au NFT de la batterie.

## Scénario dans Volteo

1. Le super-admin crée un compte **Fabricant** (back-office › Utilisateurs). Démo : `fabricant@volteo.tn`.
2. Le fabricant se connecte, ouvre **Mes batteries** et enregistre une batterie (n° de série, modèle,
   capacité, VIN) : le NFT est créé, une étiquette QR est générée et un **code d'activation** s'affiche
   (à imprimer sur la facture, jamais sur la batterie).
3. Le client ajoute sa voiture dans l'application, puis **Compte › Ma batterie certifiée** : il saisit
   le n° de série (ou le VIN) et le code d'activation. Le NFT lui est transféré.
4. À chaque fin de recharge, Laravel envoie la recharge à `ChargeLedger`, signée par le portefeuille
   de la station. L'application affiche la recharge certifiée.
5. À la revente, le client cède la batterie à l'e-mail du compte Volteo de l'acheteur.
6. N'importe qui vérifie le passeport en scannant le QR : `/batterie/<n° de série>` (sans compte).

## Lancer en local

```bash
cd blockchain
npm install
npm test               # 11 tests des deux contrats
npm run noeud          # réseau local Hardhat (http://127.0.0.1:8545) — à laisser ouvert
npm run deployer       # déploie les contrats → deployments/localhost.json
npm run pont           # pont HTTP pour Laravel (http://127.0.0.1:9400) — à laisser ouvert
```

Dans `backend/.env` :

```env
BLOCKCHAIN_PONT_URL=http://127.0.0.1:9400
BLOCKCHAIN_PONT_SECRET=secret-blockchain-dev
```

puis `php artisan migrate`. La commande `php artisan blockchain:certifier` (re)certifie les recharges
qui n'ont pas pu l'être (pont arrêté par exemple).

> Le réseau Hardhat local est **en mémoire** : s'il est redémarré, relancez `npm run deployer` et
> supprimez `data/portefeuilles.json` ; les batteries déjà enregistrées en base devront être recréées.

## Le pont (`pont.js`)

L'API Laravel ne parle pas directement à la blockchain : elle appelle ce petit serveur local, protégé
par un secret partagé. Il détient les portefeuilles des acteurs (`fabricant:{id}`, `station:{id}`,
`user:{id}`), leur donne leurs rôles dans les contrats et signe pour eux : personne n'a besoin de
MetaMask. Il simule chaque transaction avant de l'envoyer, ce qui renvoie le motif exact d'un refus
du smart contract (ex. « Energie impossible pour cette borne »).

En production, on utiliserait un réseau à frais très faibles (Polygon) ou une blockchain privée entre
opérateurs, et des clés gardées dans un coffre (HSM), pas dans un fichier.
