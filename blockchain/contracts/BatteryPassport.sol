// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * Étudiant 1 — Passeport de batterie (NFT ERC-721).
 *
 * Chaque batterie de véhicule électrique est un NFT unique créé par un fabricant agréé.
 * Le NFT porte sa fiche (numéro de série, modèle, capacité, VIN), son état de santé,
 * ses interventions et l'énergie rechargée (ajoutée par le contrat ChargeLedger de l'étudiant 2).
 * Le propriétaire du NFT est le propriétaire de la batterie : la vente = le transfert du NFT.
 */
contract BatteryPassport is ERC721, AccessControl {
    bytes32 public constant FABRICANT = keccak256("FABRICANT");
    bytes32 public constant GARAGE = keccak256("GARAGE");
    bytes32 public constant CHARGE_LEDGER = keccak256("CHARGE_LEDGER");

    struct Batterie {
        string numSerie;
        string modele;
        string chimie;
        uint16 capaciteKWh;
        string vin;
        uint8 soh; // état de santé en %
        uint64 energieTotaleWh; // énergie rechargée et certifiée
        uint32 nbRecharges;
        bool recyclee;
        uint64 dateFabrication;
        address fabricant;
    }

    struct Intervention {
        string typeIntervention;
        string description;
        address garage;
        uint64 date;
    }

    mapping(uint256 => Batterie) private _batteries;
    mapping(string => uint256) private _idParNumSerie;
    mapping(uint256 => Intervention[]) private _interventions;
    uint256 private _prochainId = 1;

    event BatterieEnregistree(uint256 indexed tokenId, string numSerie, address indexed fabricant);
    event BatterieInstallee(uint256 indexed tokenId, string vin);
    event InterventionAjoutee(uint256 indexed tokenId, string typeIntervention, address indexed garage);
    event SanteMiseAJour(uint256 indexed tokenId, uint8 soh);
    event RechargeAjoutee(uint256 indexed tokenId, uint64 energieWh);
    event BatterieRecyclee(uint256 indexed tokenId);

    constructor() ERC721("Volteo Battery Passport", "VBAT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ------------------------------------------------------------------ création du NFT

    function enregistrerBatterie(
        string calldata numSerie,
        string calldata modele,
        string calldata chimie,
        uint16 capaciteKWh,
        string calldata vin
    ) external onlyRole(FABRICANT) returns (uint256 tokenId) {
        require(bytes(numSerie).length > 0, "Numero de serie requis");
        require(_idParNumSerie[numSerie] == 0, "Batterie deja enregistree");
        require(capaciteKWh > 0, "Capacite invalide");

        tokenId = _prochainId++;
        _batteries[tokenId] = Batterie({
            numSerie: numSerie,
            modele: modele,
            chimie: chimie,
            capaciteKWh: capaciteKWh,
            vin: vin,
            soh: 100,
            energieTotaleWh: 0,
            nbRecharges: 0,
            recyclee: false,
            dateFabrication: uint64(block.timestamp),
            fabricant: msg.sender
        });
        _idParNumSerie[numSerie] = tokenId;
        _safeMint(msg.sender, tokenId);

        emit BatterieEnregistree(tokenId, numSerie, msg.sender);
        if (bytes(vin).length > 0) emit BatterieInstallee(tokenId, vin);
    }

    // ------------------------------------------------------------------ vie de la batterie

    function installerSurVehicule(string calldata numSerie, string calldata vin) external {
        uint256 id = _idActif(numSerie);
        require(
            ownerOf(id) == msg.sender || hasRole(GARAGE, msg.sender) || hasRole(FABRICANT, msg.sender),
            "Non autorise"
        );
        _batteries[id].vin = vin;
        emit BatterieInstallee(id, vin);
    }

    function transfererPropriete(string calldata numSerie, address nouveauProprietaire) external {
        uint256 id = _idActif(numSerie);
        require(ownerOf(id) == msg.sender, "Seul le proprietaire peut transferer");
        _transfer(msg.sender, nouveauProprietaire, id);
    }

    function ajouterIntervention(
        string calldata numSerie,
        string calldata typeIntervention,
        string calldata description
    ) external onlyRole(GARAGE) {
        uint256 id = _idActif(numSerie);
        _interventions[id].push(Intervention(typeIntervention, description, msg.sender, uint64(block.timestamp)));
        emit InterventionAjoutee(id, typeIntervention, msg.sender);
    }

    function mettreAJourSante(string calldata numSerie, uint8 pourcentage) external onlyRole(GARAGE) {
        require(pourcentage <= 100, "Pourcentage invalide");
        uint256 id = _idActif(numSerie);
        _batteries[id].soh = pourcentage;
        emit SanteMiseAJour(id, pourcentage);
    }

    function declarerRecyclage(string calldata numSerie) external onlyRole(GARAGE) {
        uint256 id = _idActif(numSerie);
        _batteries[id].recyclee = true;
        emit BatterieRecyclee(id);
    }

    /// Appelée uniquement par le contrat ChargeLedger (étudiant 2) après vérification d'une recharge.
    function ajouterRecharge(string calldata numSerie, uint64 energieWh) external onlyRole(CHARGE_LEDGER) {
        uint256 id = _idActif(numSerie);
        _batteries[id].energieTotaleWh += energieWh;
        _batteries[id].nbRecharges += 1;
        emit RechargeAjoutee(id, energieWh);
    }

    // ------------------------------------------------------------------ lecture publique

    function tokenIdDe(string calldata numSerie) external view returns (uint256) {
        return _idParNumSerie[numSerie];
    }

    function estActive(string calldata numSerie) external view returns (bool) {
        uint256 id = _idParNumSerie[numSerie];
        return id != 0 && !_batteries[id].recyclee;
    }

    function fiche(string calldata numSerie) external view returns (uint256 tokenId, Batterie memory infos, address proprietaire) {
        tokenId = _idParNumSerie[numSerie];
        require(tokenId != 0, "Batterie inconnue");
        return (tokenId, _batteries[tokenId], ownerOf(tokenId));
    }

    function interventions(string calldata numSerie) external view returns (Intervention[] memory) {
        uint256 id = _idParNumSerie[numSerie];
        require(id != 0, "Batterie inconnue");
        return _interventions[id];
    }

    /// Cycles complets équivalents, en centièmes (énergie rechargée / capacité).
    function cyclesCentiemes(string calldata numSerie) external view returns (uint256) {
        uint256 id = _idParNumSerie[numSerie];
        require(id != 0, "Batterie inconnue");
        Batterie storage b = _batteries[id];
        return (uint256(b.energieTotaleWh) * 100) / (uint256(b.capaciteKWh) * 1000);
    }

    // ------------------------------------------------------------------ règles internes

    function _idActif(string calldata numSerie) internal view returns (uint256 id) {
        id = _idParNumSerie[numSerie];
        require(id != 0, "Batterie inconnue");
        require(!_batteries[id].recyclee, "Batterie recyclee");
    }

    /// Une batterie recyclée ne peut plus changer de propriétaire.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        require(!_batteries[tokenId].recyclee, "Batterie recyclee");
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
