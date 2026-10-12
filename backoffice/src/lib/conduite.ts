/**
 * Conduite sur un trajet Volta (mobile et web) : position de la voiture le long du tracé,
 * batterie estimée à chaque kilomètre et alertes (borne en approche, arrivée à la borne,
 * batterie faible, arrivée). Fichier sans dépendance, recopié dans le back-office web.
 */

type Point = { lat: number; lng: number };
type Etape =
  | { type: 'depart'; nom: string; batterie: number }
  | { type: 'recharge'; nom: string; borneId: number; km: number; batterieArrivee: number; batterieDepart: number; minutes: number; prix: number }
  | { type: 'arrivee'; nom: string; km: number; batterie: number };

export type AlerteConduite = {
  cle: string;
  km: number;
  type: 'approche' | 'borne' | 'batterie_faible' | 'batterie_critique' | 'arrivee';
  titre: string;
  texte: string;
  borneId?: number;
  /** La voiture s'arrête (recharge ou arrivée) jusqu'à ce que le conducteur reprenne la route. */
  pause?: boolean;
};

const R = 6371;
const duree = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);
function km(a: Point, b: Point) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function cap(a: Point, b: Point) {
  const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const x =
    Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.cos(((b.lng - a.lng) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export class Parcours {
  readonly points: Point[];
  /** Kilomètres cumulés jusqu'à chaque point du tracé (mis à l'échelle de la distance annoncée). */
  readonly cumul: number[];
  readonly total: number;

  constructor(trace: [number, number][], distanceKm: number) {
    this.points = trace.map(([lat, lng]) => ({ lat, lng }));
    const brut = [0];
    for (let i = 1; i < this.points.length; i++) brut.push(brut[i - 1] + km(this.points[i - 1], this.points[i]));
    const longueur = brut[brut.length - 1] || 1;
    // Les étapes sont exprimées dans les km de l'itinéraire : on aligne le tracé dessus.
    const echelle = distanceKm > 0 ? distanceKm / longueur : 1;
    this.cumul = brut.map((d) => d * echelle);
    this.total = this.cumul[this.cumul.length - 1] ?? 0;
  }

  /** Position et orientation de la voiture après `d` km. */
  position(d: number): Point & { cap: number } {
    const p = this.points;
    if (p.length < 2) return { ...(p[0] ?? { lat: 0, lng: 0 }), cap: 0 };
    const x = Math.max(0, Math.min(this.total, d));
    let i = 1;
    while (i < p.length - 1 && this.cumul[i] < x) i++;
    const t = (x - this.cumul[i - 1]) / Math.max(1e-9, this.cumul[i] - this.cumul[i - 1]);
    return {
      lat: p[i - 1].lat + (p[i].lat - p[i - 1].lat) * t,
      lng: p[i - 1].lng + (p[i].lng - p[i - 1].lng) * t,
      cap: cap(p[i - 1], p[i]),
    };
  }

  /** Kilomètres parcourus pour une position GPS : point du tracé le plus proche. */
  projeter(pos: Point, avant = 0): number {
    let meilleur = avant;
    let ecart = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      // On ne revient pas en arrière de plus de 2 km (boucles du tracé).
      if (this.cumul[i] < avant - 2) continue;
      const e = km(pos, this.points[i]);
      if (e < ecart) {
        ecart = e;
        meilleur = this.cumul[i];
      }
    }
    return meilleur;
  }

  ecart(pos: Point) {
    return Math.min(...this.points.map((p) => km(pos, p)));
  }
}

/** Batterie estimée (en %) après `d` km, d'après les étapes calculées par Volta. */
export function batterieA(etapes: Etape[], d: number, rechargees: Set<string>): number {
  let precedentKm = 0;
  let precedentNiveau = etapes[0]?.type === 'depart' ? etapes[0].batterie : 80;
  for (const e of etapes) {
    if (e.type === 'depart') continue;
    const arrivee = e.type === 'recharge' ? e.batterieArrivee : e.batterie;
    if (d <= e.km) {
      const t = (d - precedentKm) / Math.max(0.001, e.km - precedentKm);
      return Math.max(0, Math.round(precedentNiveau + (arrivee - precedentNiveau) * t));
    }
    precedentKm = e.km;
    // Sans recharge effectuée à cette borne, la batterie continue de baisser.
    precedentNiveau = e.type === 'recharge' && rechargees.has(`borne-${e.borneId}`) ? e.batterieDepart : arrivee;
  }
  return Math.max(0, Math.round(precedentNiveau));
}

/** Alertes du trajet, dans l'ordre des kilomètres. */
export function alertesTrajet(etapes: Etape[], total: number): AlerteConduite[] {
  const alertes: AlerteConduite[] = [];
  for (const e of etapes) {
    if (e.type === 'recharge') {
      if (e.km > 3) {
        alertes.push({
          cle: `approche-${e.borneId}`,
          km: e.km - 2,
          type: 'approche',
          titre: 'Borne de recharge dans 2 km',
          texte: `${e.nom} : préparez-vous à vous arrêter. Batterie prévue à l’arrivée : ${e.batterieArrivee} %.`,
          borneId: e.borneId,
        });
      }
      alertes.push({
        cle: `borne-${e.borneId}`,
        km: e.km,
        type: 'borne',
        titre: `Arrêt recharge : ${e.nom}`,
        texte: `Vous êtes arrivé à la borne avec ${e.batterieArrivee} % de batterie. Rechargez environ ${duree(e.minutes)} jusqu’à ${e.batterieDepart} % (≈ ${e.prix.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DT) pour continuer votre trajet.`,
        borneId: e.borneId,
        pause: true,
      });
    }
  }
  const fin = etapes[etapes.length - 1];
  if (fin?.type === 'arrivee') {
    alertes.push({
      cle: 'arrivee',
      km: total,
      type: 'arrivee',
      titre: `Vous êtes arrivé à ${fin.nom}`,
      texte:
        fin.batterie < 20
          ? `Il vous reste ${fin.batterie} % de batterie : pensez à recharger avant de repartir.`
          : `Il vous reste ${fin.batterie} % de batterie. Bonne journée !`,
      pause: true,
    });
  }
  return alertes.sort((a, b) => a.km - b.km);
}

/** Alerte batterie (une seule fois par seuil) selon le niveau estimé pendant la conduite. */
export function alerteBatterie(etapes: Etape[], d: number, niveau: number, dejaVues: Set<string>): AlerteConduite | null {
  const seuil = niveau < 10 ? 'batterie_critique' : niveau < 20 ? 'batterie_faible' : null;
  if (!seuil || dejaVues.has(seuil)) return null;
  const borne = etapes.find((e) => e.type === 'recharge' && e.km >= d) as Extract<Etape, { type: 'recharge' }> | undefined;
  return {
    cle: seuil,
    km: d,
    type: seuil,
    titre: `${seuil === 'batterie_critique' ? 'Batterie critique' : 'Batterie faible'} : ${niveau} %`,
    texte: borne
      ? `Rechargez à ${borne.nom}, dans ${Math.max(1, Math.round(borne.km - d))} km. Évitez la climatisation et les fortes accélérations d’ici là.`
      : 'Évitez la climatisation et les fortes accélérations, et rechargez dès votre arrivée.',
    borneId: borne?.borneId,
  };
}

/** Consommation moyenne d'une voiture électrique (kWh par km), utilisée pour l'autonomie restante. */
export const CONSOMMATION_KWH_KM = 0.17;

/** Autonomie restante estimée (km) pour un niveau de batterie. */
export function autonomieKm(niveau: number, capaciteKwh: number, consommation = CONSOMMATION_KWH_KM) {
  return Math.max(0, ((niveau / 100) * capaciteKwh) / consommation);
}

/**
 * Autonomie insuffisante : la batterie ne permet pas d'atteindre la prochaine borne prévue
 * (ou l'arrivée, s'il n'y a plus d'arrêt). Une seule alerte par destination intermédiaire.
 */
export function alerteAutonomie(
  etapes: Etape[],
  d: number,
  niveau: number,
  capaciteKwh: number,
  rechargees: Set<string>,
  dejaVues: Set<string>
): AlerteConduite | null {
  // À l'approche d'un arrêt recharge prévu, c'est l'alerte de la borne qui prend le relais.
  if (etapes.some((e) => e.type === 'recharge' && Math.abs(e.km - d) < 3 && !rechargees.has(`borne-${e.borneId}`))) return null;
  const cible = etapes.find(
    (e) => (e.type === 'recharge' && e.km > d + 0.2 && !rechargees.has(`borne-${e.borneId}`)) || e.type === 'arrivee'
  ) as Extract<Etape, { type: 'recharge' | 'arrivee' }> | undefined;
  if (!cible) return null;
  const reste = cible.km - d;
  const autonomie = autonomieKm(niveau, capaciteKwh);
  const cle = `autonomie-${cible.type === 'recharge' ? cible.borneId : 'arrivee'}`;
  // Marge de 10 % : l'estimation dépend du relief, de la vitesse et de la climatisation.
  if (autonomie >= reste * 1.1 || dejaVues.has(cle)) return null;
  const borne = cible.type === 'recharge';
  return {
    cle,
    km: d,
    type: 'batterie_critique',
    titre: 'Autonomie insuffisante',
    texte: `Il vous reste environ ${Math.round(autonomie)} km d’autonomie, mais ${borne ? `la borne ${cible.nom}` : `${cible.nom}`} est à ${Math.round(reste)} km. ${
      borne ? 'Roulez à vitesse modérée, coupez la climatisation, ou arrêtez-vous à une borne plus proche.' : 'Prévoyez un arrêt recharge avant d’arriver.'
    }`,
    borneId: borne ? cible.borneId : undefined,
  };
}

/** Sortie d'itinéraire (GPS) : plus de 300 m du tracé. */
export function alerteEcart(ecartKm: number, dejaVues: Set<string>): AlerteConduite | null {
  if (ecartKm < 0.3) {
    dejaVues.delete('hors-itineraire');
    return null;
  }
  if (dejaVues.has('hors-itineraire')) return null;
  return {
    cle: 'hors-itineraire',
    km: 0,
    type: 'approche',
    titre: 'Vous avez quitté l’itinéraire',
    texte: `Vous êtes à ${Math.round(ecartKm * 1000)} m de la route prévue. Faites demi-tour dès que possible ou recalculez le trajet.`,
  };
}

/** Phrase lue à voix haute pour une consigne de guidage (« Dans 300 mètres, tournez à droite »). */
export function phraseGuidage(texte: string, dansKm: number) {
  if (/recharge atteint/i.test(texte)) return `Dans ${dansKm < 1 ? `${Math.max(50, Math.round((dansKm * 1000) / 50) * 50)} mètres` : `${Math.round(dansKm)} kilomètres`}, votre borne de recharge`;
  if (/arriv/i.test(texte)) return `Dans ${dansKm < 1 ? `${Math.max(50, Math.round((dansKm * 1000) / 50) * 50)} mètres` : `${Math.round(dansKm)} kilomètres`}, vous êtes arrivé à destination`;
  const distance = dansKm < 1 ? `${Math.max(50, Math.round((dansKm * 1000) / 50) * 50)} mètres` : `${Math.round(dansKm * 10) / 10} kilomètres`.replace('.', ',');
  // Les noms de rue en arabe ne sont pas lus par une voix française : on garde la manœuvre.
  const sansArabe = texte.replace(/[\u0600-\u06FF]+[\u0600-\u06FF\s\-–]*/g, '').replace(/\s+sur\s*$/i, '').trim();
  return `Dans ${distance}, ${sansArabe.charAt(0).toLowerCase()}${sansArabe.slice(1)}`;
}

/** Vitesse de la simulation : le trajet entier défile en 60 à 150 s, ralenti en ville. */
export function kmParSeconde(total: number) {
  return Math.max(0.2, total / Math.min(150, Math.max(60, total / 1.5)));
}
