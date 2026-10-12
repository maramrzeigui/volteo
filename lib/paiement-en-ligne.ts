import * as WebBrowser from 'expo-web-browser';

import { afficherPopup } from '@/components/ui/popup';
import * as api from '@/lib/api';
import { informer } from '@/lib/dialogue';
import { formatPrix } from '@/lib/format';

const LIBELLES: Record<api.MoyenPaiement, string> = {
  carte: 'Carte bancaire (CIB, Visa, Mastercard)',
  flouci: 'Flouci',
  edinar: 'e-DINAR / D17',
};

type Objet =
  | { objet: 'recharge_wallet'; montant: number }
  | { objet: 'reglement'; paiementId: number; montant: number }
  | { objet: 'abonnement'; abonnementId: number; montant: number; nom: string };

/**
 * Paiement en ligne depuis l'application : choix du moyen, page sécurisée du prestataire
 * (ClicToPay, Flouci, Konnect) dans un navigateur intégré, puis vérification par le serveur.
 * Renvoie true si le paiement est confirmé.
 */
export async function payerEnLigne(o: Objet): Promise<boolean> {
  const { moyens, modeTest } = await api.moyensPaiement();
  if (!moyens.length) {
    informer('Paiement indisponible', 'Aucun moyen de paiement en ligne n’est configuré pour le moment. Utilisez votre wallet.');
    return false;
  }
  const choix = await afficherPopup({
    titre: o.objet === 'recharge_wallet' ? `Recharger ${formatPrix(o.montant)}` : o.objet === 'reglement' ? `Régler ${formatPrix(o.montant)}` : `Formule ${o.nom} · ${formatPrix(o.montant)}`,
    message: modeTest ? 'Mode test : aucun débit réel. Choisissez votre moyen de paiement.' : 'Vous serez redirigé vers la page sécurisée de votre banque ou du prestataire.',
    icone: 'credit-card-outline',
    boutons: [
      ...moyens.map((m) => ({ libelle: LIBELLES[m.moyen], valeur: m.moyen, style: 'option' as const })),
      { libelle: 'Annuler', valeur: 'annuler', style: 'annuler' as const },
    ],
  });
  if (!choix || choix === 'annuler') return false;

  const t = await api.payerEnLigne({
    objet: o.objet,
    moyen: choix as api.MoyenPaiement,
    montant: o.objet === 'recharge_wallet' ? o.montant : undefined,
    paiement_id: o.objet === 'reglement' ? o.paiementId : undefined,
    abonnement_id: o.objet === 'abonnement' ? o.abonnementId : undefined,
  });
  if (!t.url) throw new Error('Page de paiement indisponible.');

  // Le serveur renvoie vers borneapp://paiement?transaction=… à la fin du paiement.
  await WebBrowser.openAuthSessionAsync(t.url, 'borneapp://paiement');

  let resultat = await api.transactionEnLigne(t.reference);
  for (let i = 0; resultat.statut === 'en_cours' && i < 6; i++) {
    await new Promise((ok) => setTimeout(ok, 1500));
    resultat = await api.transactionEnLigne(t.reference);
  }
  if (resultat.statut === 'reussie') {
    informer('Paiement réussi', `Paiement de ${formatPrix(resultat.montant)} confirmé.${resultat.soldeWallet != null && o.objet === 'recharge_wallet' ? ` Nouveau solde : ${formatPrix(resultat.soldeWallet)}.` : ''}`, 'check-decagram-outline');
    return true;
  }
  informer(
    resultat.statut === 'en_cours' ? 'Paiement en cours de validation' : 'Paiement non abouti',
    resultat.statut === 'en_cours' ? 'Votre banque valide encore le paiement. Le solde sera mis à jour dès confirmation.' : 'Aucun montant n’a été débité. Vous pouvez réessayer.'
  );
  return false;
}
