/**
 * Déploie BatteryPassport (étudiant 1) puis ChargeLedger (étudiant 2), autorise ChargeLedger à
 * ajouter les recharges dans les NFT, et écrit les adresses dans deployments/<réseau>.json.
 */
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const [volteo] = await ethers.getSigners();

  const passport = await ethers.deployContract("BatteryPassport");
  await passport.waitForDeployment();
  const ledger = await ethers.deployContract("ChargeLedger", [await passport.getAddress()]);
  await ledger.waitForDeployment();

  await (await passport.grantRole(await passport.CHARGE_LEDGER(), await ledger.getAddress())).wait();

  const sortie = {
    reseau: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    administrateur: volteo.address,
    batteryPassport: await passport.getAddress(),
    chargeLedger: await ledger.getAddress(),
    deployeLe: new Date().toISOString(),
  };
  const dossier = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, `${network.name}.json`), JSON.stringify(sortie, null, 2));

  console.log("BatteryPassport :", sortie.batteryPassport);
  console.log("ChargeLedger    :", sortie.chargeLedger);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
