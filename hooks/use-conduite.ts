import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';

import { alerteAutonomie, alerteBatterie, alerteEcart, alertesTrajet, autonomieKm, batterieA, kmParSeconde, Parcours, phraseGuidage, type AlerteConduite } from '@/lib/conduite';
import { parler } from '@/lib/voix';
import { confirmer, informer } from '@/lib/dialogue';
import type { TrajetVolta } from '@/types/domain';

export type PositionConduite = { lat: number; lng: number; cap: number | null };

/**
 * Conduite sur le trajet : la voiture suit le GPS du téléphone si l'on est sur l'itinéraire,
 * sinon une simulation la fait avancer le long du tracé (simulateur, démonstration).
 * La batterie est estimée en route ; Volta prévient à l'approche des bornes, quand la
 * batterie devient faible et à l'arrivée.
 */
export function useConduite(trajet: TrajetVolta | null, actif: boolean, depart: { lat: number; lng: number } | null, onFin: () => void, capaciteKwh = 60) {
  const parcours = useMemo(() => (trajet && trajet.trace.length > 1 ? new Parcours(trajet.trace, trajet.distanceKm) : null), [trajet]);
  const alertes = useMemo(() => (trajet && parcours ? alertesTrajet(trajet.etapes, parcours.total) : []), [trajet, parcours]);

  // Kilomètre de chaque manœuvre du guidage, pour afficher la prochaine consigne.
  const instructionsKm = useMemo(() => {
    if (!trajet || !parcours) return [];
    let avant = 0;
    return trajet.instructions.map((g) => (avant = parcours.projeter(g, avant)));
  }, [trajet, parcours]);

  const [mode, setMode] = useState<'gps' | 'simulation'>('simulation');
  const [km, setKm] = useState(0);
  const [pos, setPos] = useState<PositionConduite | null>(null);
  const [vitesse, setVitesse] = useState(1);
  const [bloque, setBloque] = useState(false);
  const [bandeau, setBandeau] = useState<AlerteConduite | null>(null);
  const vues = useRef(new Set<string>());
  const annoncee = useRef(-1);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const rechargees = useRef(new Set<string>());
  const finRef = useRef(onFin);
  finRef.current = onFin;

  // Au démarrage : GPS si l'on se trouve sur l'itinéraire, sinon simulation.
  useEffect(() => {
    if (!actif || !parcours) return;
    vues.current = new Set();
    rechargees.current = new Set();
    setKm(0);
    setBandeau(null);
    setBloque(false);
    setVitesse(1);
    const surLeTrajet = depart != null && parcours.ecart(depart) < 1;
    setMode(surLeTrajet ? 'gps' : 'simulation');
    const p = parcours.position(0);
    setPos({ lat: p.lat, lng: p.lng, cap: p.cap });
    annoncee.current = -1;
    parler(`C’est parti. ${trajet ? `${trajet.distanceKm} kilomètres jusqu’à ${trajet.arrivee}.` : ''}`, true);
    // Seul le démarrage compte : la position de départ ne relance pas la conduite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, parcours]);

  // Simulation : la voiture avance 5 fois par seconde.
  useEffect(() => {
    if (!actif || !parcours || mode !== 'simulation' || bloque) return;
    const pas = kmParSeconde(parcours.total) * vitesse * 0.2;
    const t = setInterval(() => {
      setKm((k) => {
        const n = Math.min(parcours.total, k + pas);
        const p = parcours.position(n);
        setPos({ lat: p.lat, lng: p.lng, cap: p.cap });
        return n;
      });
    }, 200);
    return () => clearInterval(t);
  }, [actif, parcours, mode, bloque, vitesse]);

  // GPS : position réelle projetée sur l'itinéraire.
  useEffect(() => {
    if (!actif || !parcours || mode !== 'gps') return;
    let abonnement: Location.LocationSubscription | null = null;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5 }, (p) => {
      const ici = { lat: p.coords.latitude, lng: p.coords.longitude };
      setPos({ ...ici, cap: p.coords.heading != null && p.coords.heading >= 0 ? p.coords.heading : null });
      setGps(ici);
      setKm((k) => parcours.projeter(ici, k));
    })
      .then((s) => (abonnement = s))
      .catch(() => setMode('simulation'));
    return () => abonnement?.remove();
  }, [actif, parcours, mode]);

  const batterie = trajet ? batterieA(trajet.etapes, km, rechargees.current) : 0;

  // Alertes au kilomètre où elles se déclenchent.
  useEffect(() => {
    if (!actif || !trajet || bloque) return;
    const a =
      alertes.find((x) => x.km <= km && !vues.current.has(x.cle)) ??
      alerteBatterie(trajet.etapes, km, batterie, vues.current) ??
      alerteAutonomie(trajet.etapes, km, batterie, capaciteKwh, rechargees.current, vues.current) ??
      (mode === 'gps' && gps && parcours ? alerteEcart(parcours.ecart(gps), vues.current) : null);
    if (!a) return;
    vues.current.add(a.cle);
    parler(`${a.titre}. ${a.texte}`, true);
    Haptics.notificationAsync(a.type === 'approche' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    if (a.type === 'borne') {
      setBloque(true);
      confirmer(a.titre, a.texte, { confirmer: 'Recharger', annuler: 'Sans recharger', icone: 'ev-station' }).then((ok) => {
        if (ok && a.borneId) {
          rechargees.current.add(`borne-${a.borneId}`);
          vues.current.delete('batterie_faible');
          vues.current.delete('batterie_critique');
          const fin = batterieA(trajet.etapes, km, rechargees.current);
          montrer({ ...a, cle: `recharge-${a.borneId}`, type: 'approche', titre: `Recharge terminée : ${fin} %`, texte: 'Vous pouvez reprendre la route. Bon trajet !' });
        }
        setBloque(false);
      });
    } else if (a.type === 'arrivee') {
      setBloque(true);
      informer(a.titre, a.texte, 'flag-checkered');
      finRef.current();
    } else {
      montrer(a);
    }
  }, [actif, km, alertes, batterie, trajet, bloque, capaciteKwh, mode, gps, parcours]);

  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  function montrer(a: AlerteConduite) {
    setBandeau(a);
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setBandeau(null), 7000);
  }

  const resteKm = parcours ? Math.max(0, parcours.total - km) : 0;
  const minutesRecharge = (trajet?.etapes ?? []).reduce((t, e) => t + (e.type === 'recharge' && e.km > km ? e.minutes : 0), 0);

  const prochaine = instructionsKm.findIndex((k) => k > km + 0.03);

  // Guidage vocal : chaque manœuvre est annoncée une fois, à 300 m environ.
  useEffect(() => {
    if (!actif || !trajet || bloque || prochaine < 0 || prochaine === annoncee.current) return;
    const dansKm = instructionsKm[prochaine] - km;
    if (dansKm < 0.35) {
      annoncee.current = prochaine;
      parler(phraseGuidage(trajet.instructions[prochaine].texte, dansKm));
    }
  }, [actif, trajet, bloque, prochaine, instructionsKm, km]);

  return {
    mode,
    etape: prochaine >= 0 ? prochaine : Math.max(0, instructionsKm.length - 1),
    autonomie: Math.round(autonomieKm(batterie, capaciteKwh)),
    /** Itinéraire restant (de la voiture à l'arrivée) : il se raccourcit à mesure qu'on avance. */
    restant: parcours && actif && pos
      ? ([[pos.lat, pos.lng], ...parcours.points.filter((_, i) => parcours.cumul[i] > km).map((p) => [p.lat, p.lng])] as [number, number][])
      : null,
    km,
    pos,
    batterie,
    bandeau,
    vitesse,
    resteKm,
    minutes: Math.round((resteKm / 70) * 60) + minutesRecharge,
    accelerer: () => setVitesse((v) => (v >= 4 ? 1 : v * 2)),
    /** Passer du GPS à la simulation (démonstration, simulateur). */
    simuler: () => setMode('simulation'),
  };
}
