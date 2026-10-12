/**
 * Estimations de recharge. Fonctions pures, sans dépendance à l'interface :
 * réutilisables telles quelles par un futur assistant IA.
 */

/** Part de la puissance nominale réellement tenue en moyenne (pertes + ralentissement en fin de charge). */
const RENDEMENT_MOYEN = 0.85;
const KWH_AUX_100_KM = 17;

export interface EstimationCharge {
  energieKwh: number;
  minutes: number;
  prix: number;
  kmAjoutes: number;
}

export function estimerCharge(params: {
  batterieActuelle: number;
  objectif: number;
  capaciteKwh: number;
  puissanceKw: number;
  tarifKwh: number;
}): EstimationCharge {
  const ecart = Math.max(0, params.objectif - params.batterieActuelle);
  const energieKwh = (ecart / 100) * params.capaciteKwh;

  // Au-delà de 80 %, les véhicules réduisent fortement la puissance acceptée.
  const partLente = Math.max(0, params.objectif - Math.max(80, params.batterieActuelle)) / 100;
  const energieLente = partLente * params.capaciteKwh;
  const puissanceUtile = params.puissanceKw * RENDEMENT_MOYEN;
  const minutes =
    puissanceUtile > 0
      ? ((energieKwh - energieLente) / puissanceUtile + energieLente / (puissanceUtile * 0.45)) * 60
      : 0;

  return {
    energieKwh,
    minutes: Math.round(minutes),
    prix: energieKwh * params.tarifKwh,
    kmAjoutes: Math.round((energieKwh / KWH_AUX_100_KM) * 100),
  };
}

/** Autonomie restante approximative pour un niveau de batterie donné. */
export function autonomieKm(pourcentage: number, capaciteKwh: number): number {
  return Math.round(((pourcentage / 100) * capaciteKwh * 100) / KWH_AUX_100_KM);
}

/** Heure de fin d'une recharge en cours, d'après la puissance instantanée. */
export function finEstimee(params: {
  batterie: number;
  objectif: number;
  capaciteKwh: number;
  puissanceKw: number | null | undefined;
}): Date | null {
  if (!params.puissanceKw || params.puissanceKw <= 0 || params.batterie >= params.objectif) return null;
  const { minutes } = estimerCharge({
    batterieActuelle: params.batterie,
    objectif: params.objectif,
    capaciteKwh: params.capaciteKwh,
    puissanceKw: params.puissanceKw / RENDEMENT_MOYEN,
    tarifKwh: 0,
  });
  return new Date(Date.now() + minutes * 60_000);
}
