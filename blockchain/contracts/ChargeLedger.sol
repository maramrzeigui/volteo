// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface IBatteryPassport {
    function estActive(string calldata numSerie) external view returns (bool);
    function ajouterRecharge(string calldata numSerie, uint64 energieWh) external;
}

/**
 * Étudiant 2 — Registre des recharges Volteo.
 *
 * Seules les stations agréées par Volteo peuvent inscrire une recharge. Chaque recharge est
 * vérifiée (anti-doublon, cohérence énergie/puissance/durée, batterie active), enregistrée pour
 * toujours, puis rattachée au NFT de la batterie dans BatteryPassport (étudiant 1).
 */
contract ChargeLedger is AccessControl {
    bytes32 public constant STATION = keccak256("STATION");

    struct Recharge {
        string sessionId;
        string idBorne;
        uint64 energieWh;
        uint32 puissanceMaxW;
        uint64 debut;
        uint64 fin;
        address station;
    }

    IBatteryPassport public immutable passport;

    mapping(address => string) public nomStation;
    mapping(string => Recharge[]) private _recharges; // numéro de série => recharges
    mapping(bytes32 => bool) public sessionEnregistree;

    event StationAgreee(address indexed station, string nom);
    event StationRetiree(address indexed station);
    event RechargeEnregistree(
        string numSerie,
        string sessionId,
        string idBorne,
        uint64 energieWh,
        address indexed station
    );

    constructor(address passportAdresse) {
        passport = IBatteryPassport(passportAdresse);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function agreerStation(address station, string calldata nom) external onlyRole(DEFAULT_ADMIN_ROLE) {
        nomStation[station] = nom;
        _grantRole(STATION, station);
        emit StationAgreee(station, nom);
    }

    function retirerStation(address station) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(STATION, station);
        emit StationRetiree(station);
    }

    function enregistrerRecharge(
        string calldata numSerie,
        string calldata sessionId,
        string calldata idBorne,
        uint64 energieWh,
        uint32 puissanceMaxW,
        uint64 debut,
        uint64 fin
    ) external onlyRole(STATION) {
        bytes32 cle = keccak256(bytes(sessionId));
        require(!sessionEnregistree[cle], "Session deja enregistree");
        require(passport.estActive(numSerie), "Batterie inconnue ou recyclee");
        require(energieWh > 0, "Energie nulle");
        require(fin > debut, "Horaires invalides");
        require(fin <= block.timestamp + 300, "Recharge dans le futur");
        // Énergie (Wh) x 3600 <= puissance (W) x durée (s) : impossible de déclarer plus que la borne peut fournir.
        require(uint256(energieWh) * 3600 <= uint256(puissanceMaxW) * (fin - debut), "Energie impossible pour cette borne");

        sessionEnregistree[cle] = true;
        _recharges[numSerie].push(Recharge(sessionId, idBorne, energieWh, puissanceMaxW, debut, fin, msg.sender));
        passport.ajouterRecharge(numSerie, energieWh);

        emit RechargeEnregistree(numSerie, sessionId, idBorne, energieWh, msg.sender);
    }

    function recharges(string calldata numSerie) external view returns (Recharge[] memory) {
        return _recharges[numSerie];
    }

    function nombreRecharges(string calldata numSerie) external view returns (uint256) {
        return _recharges[numSerie].length;
    }

    function totalRecharge(string calldata numSerie) external view returns (uint256 totalWh) {
        Recharge[] storage liste = _recharges[numSerie];
        for (uint256 i = 0; i < liste.length; i++) totalWh += liste[i].energieWh;
    }
}
