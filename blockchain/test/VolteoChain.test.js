const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Volteo Chain", function () {
  let passport, ledger, volteo, fabricant, garage, station, ahmed, sarra, inconnu;

  beforeEach(async function () {
    [volteo, fabricant, garage, station, ahmed, sarra, inconnu] = await ethers.getSigners();

    passport = await ethers.deployContract("BatteryPassport");
    ledger = await ethers.deployContract("ChargeLedger", [await passport.getAddress()]);

    await passport.grantRole(await passport.FABRICANT(), fabricant.address);
    await passport.grantRole(await passport.GARAGE(), garage.address);
    await passport.grantRole(await passport.CHARGE_LEDGER(), await ledger.getAddress());
    await ledger.agreerStation(station.address, "Lac Energie");

    await passport.connect(fabricant).enregistrerBatterie("BAT-001", "Megane E-Tech", "NMC", 60, "VF1RCB00012345678");
  });

  async function recharge(sessionId, energieWh, puissanceW = 22000, dureeS = 3600) {
    const fin = BigInt(await time.latest());
    return ledger.connect(station).enregistrerRecharge("BAT-001", sessionId, "BRN-TUN-001", energieWh, puissanceW, fin - BigInt(dureeS), fin);
  }

  describe("BatteryPassport (étudiant 1)", function () {
    it("crée un NFT par batterie, détenu par le fabricant", async function () {
      expect(await passport.tokenIdDe("BAT-001")).to.equal(1n);
      expect(await passport.ownerOf(1)).to.equal(fabricant.address);
      const [, infos] = await passport.fiche("BAT-001");
      expect(infos.vin).to.equal("VF1RCB00012345678");
      expect(infos.soh).to.equal(100);
    });

    it("refuse un fabricant non agréé et un numéro de série en double", async function () {
      await expect(passport.connect(inconnu).enregistrerBatterie("BAT-002", "X", "LFP", 50, "")).to.be.reverted;
      await expect(passport.connect(fabricant).enregistrerBatterie("BAT-001", "X", "LFP", 50, "")).to.be.revertedWith("Batterie deja enregistree");
    });

    it("transfère le NFT à la vente, seul le propriétaire peut vendre", async function () {
      await passport.connect(fabricant).transfererPropriete("BAT-001", ahmed.address);
      expect(await passport.ownerOf(1)).to.equal(ahmed.address);
      await expect(passport.connect(fabricant).transfererPropriete("BAT-001", sarra.address)).to.be.revertedWith("Seul le proprietaire peut transferer");
      await passport.connect(ahmed).transfererPropriete("BAT-001", sarra.address);
      expect(await passport.ownerOf(1)).to.equal(sarra.address);
    });

    it("réserve interventions et santé au garage agréé", async function () {
      await expect(passport.connect(ahmed).mettreAJourSante("BAT-001", 50)).to.be.reverted;
      await passport.connect(garage).ajouterIntervention("BAT-001", "Controle", "RAS");
      await passport.connect(garage).mettreAJourSante("BAT-001", 88);
      const [, infos] = await passport.fiche("BAT-001");
      expect(infos.soh).to.equal(88);
      expect((await passport.interventions("BAT-001")).length).to.equal(1);
    });

    it("bloque une batterie recyclée", async function () {
      await passport.connect(garage).declarerRecyclage("BAT-001");
      await expect(passport.connect(fabricant).transfererPropriete("BAT-001", ahmed.address)).to.be.revertedWith("Batterie recyclee");
      expect(await passport.estActive("BAT-001")).to.equal(false);
    });
  });

  describe("ChargeLedger (étudiant 2)", function () {
    it("enregistre une recharge d'une station agréée et l'ajoute au NFT", async function () {
      await expect(recharge("volteo-1", 18000)).to.emit(ledger, "RechargeEnregistree");
      expect(await ledger.nombreRecharges("BAT-001")).to.equal(1n);
      expect(await ledger.totalRecharge("BAT-001")).to.equal(18000n);
      const [, infos] = await passport.fiche("BAT-001");
      expect(infos.energieTotaleWh).to.equal(18000n);
      expect(await passport.cyclesCentiemes("BAT-001")).to.equal(30n); // 18 kWh / 60 kWh = 0,30 cycle
    });

    it("refuse une station non agréée", async function () {
      const fin = BigInt(await time.latest());
      await expect(ledger.connect(ahmed).enregistrerRecharge("BAT-001", "x", "B", 1000, 22000, fin - 3600n, fin)).to.be.reverted;
    });

    it("refuse une session enregistrée deux fois", async function () {
      await recharge("volteo-2", 10000);
      await expect(recharge("volteo-2", 10000)).to.be.revertedWith("Session deja enregistree");
    });

    it("refuse une énergie impossible pour la puissance de la borne", async function () {
      // 30 kWh en 1 h sur une borne de 22 kW : impossible
      await expect(recharge("volteo-3", 30000)).to.be.revertedWith("Energie impossible pour cette borne");
    });

    it("refuse une recharge sur une batterie recyclée ou inconnue", async function () {
      await passport.connect(garage).declarerRecyclage("BAT-001");
      await expect(recharge("volteo-4", 5000)).to.be.revertedWith("Batterie inconnue ou recyclee");
    });

    it("garde l'historique après la vente de la batterie", async function () {
      await passport.connect(fabricant).transfererPropriete("BAT-001", ahmed.address);
      await recharge("volteo-5", 12000);
      await passport.connect(ahmed).transfererPropriete("BAT-001", sarra.address);
      expect(await ledger.nombreRecharges("BAT-001")).to.equal(1n);
      expect(await passport.ownerOf(1)).to.equal(sarra.address);
    });
  });
});
