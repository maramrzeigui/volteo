import { formatNombre } from '@/lib/format';
import type { Borne, ModeTarif, TarifApplique } from '@/types/domain';

/**
 * Tarification affichée et estimée côté application, alignée sur le calcul
 * du serveur (App\Services\Tarification) : prix par kWh, minute, heure ou
 * puissance, heures creuses, frais de session, remise d'abonnement.
 * Fonctions pures, réutilisables telles quelles.
 */

export const UNITE_TARIF: Record<ModeTarif, string> = {
  kwh: 'kWh',
  minute: 'min',
  heure: 'h',
  puissance: 'kW·h',
};

/** Tarif en vigueur d'une borne ; à défaut, son prix de repli au kWh. */
export function tarifDeBorne(borne: Pick<Borne, 'tarifApplique' | 'tarifKwh'>): TarifApplique {
  return (
    borne.tarifApplique ?? {
      nom: 'Prix au kWh',
      mode: 'kwh',
      prix: borne.tarifKwh,
      prixHeuresCreuses: null,
      heuresCreusesDebut: null,
      heuresCreusesFin: null,
      fraisSession: 0,
      special: false,
      valideAu: null,
    }
  );
}

/** L'instant tombe-t-il dans la plage d'heures creuses (qui peut enjamber minuit) ? */
export function enHeuresCreuses(tarif: TarifApplique, instant: Date = new Date()): boolean {
  if (tarif.prixHeuresCreuses == null || !tarif.heuresCreusesDebut || !tarif.heuresCreusesFin) return false;
  const heure = `${String(instant.getHours()).padStart(2, '0')}:${String(instant.getMinutes()).padStart(2, '0')}`;
  const { heuresCreusesDebut: debut, heuresCreusesFin: fin } = tarif;
  return debut <= fin ? heure >= debut && heure < fin : heure >= debut || heure < fin;
}

export function prixUnitaire(tarif: TarifApplique, instant: Date = new Date()): number {
  return enHeuresCreuses(tarif, instant) ? (tarif.prixHeuresCreuses ?? tarif.prix) : tarif.prix;
}

/** « 0,30 » + « DT / kWh », pour l'affichage. */
export function libelleTarif(tarif: TarifApplique, instant: Date = new Date()) {
  const prix = prixUnitaire(tarif, instant);
  return {
    montant: formatNombre(prix, prix < 0.1 ? 3 : 2),
    unite: `DT / ${UNITE_TARIF[tarif.mode]}`,
    heuresCreuses: enHeuresCreuses(tarif, instant),
  };
}

/** Prix d'une recharge (frais de session inclus, remise d'abonnement déduite). */
export function prixRecharge(params: {
  tarif: TarifApplique;
  energieKwh: number;
  minutes: number;
  puissanceKw: number;
  debut?: Date;
  remisePourcent?: number;
}): number {
  const unitaire = prixUnitaire(params.tarif, params.debut ?? new Date());
  const heures = params.minutes / 60;
  const variable = {
    kwh: unitaire * params.energieKwh,
    minute: unitaire * params.minutes,
    heure: unitaire * heures,
    puissance: unitaire * params.puissanceKw * heures,
  }[params.tarif.mode];
  const brut = variable + params.tarif.fraisSession;
  return Math.max(0, brut * (1 - (params.remisePourcent ?? 0) / 100));
}
