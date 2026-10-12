import { afficherPopup } from '@/components/ui/popup';
import type { NomIcone } from '@/components/ui/icone';

// Dialogues de l'application : popups animées aux couleurs de Volteo (natif et web).

export async function confirmer(
  titre: string,
  message: string,
  {
    confirmer: libelle = 'Confirmer',
    annuler = 'Annuler',
    destructif = false,
    icone,
  }: { confirmer?: string; annuler?: string; destructif?: boolean; icone?: NomIcone } = {}
): Promise<boolean> {
  const choix = await afficherPopup({
    titre,
    message,
    icone: icone ?? (destructif ? 'alert-octagon-outline' : 'help-circle-outline'),
    ton: destructif ? 'danger' : 'marque',
    boutons: [
      { libelle: annuler, valeur: 'non', style: 'annuler' },
      { libelle, valeur: 'oui', style: destructif ? 'destructif' : 'principal' },
    ],
  });
  return choix === 'oui';
}

/** Les messages d'échec (« … impossible », « … refusée ») prennent automatiquement le ton d'alerte. */
export function informer(titre: string, message: string, icone?: NomIcone): void {
  const echec = /impossible|échec|erreur|refus|indisponible|insuffisant/i.test(titre);
  afficherPopup({
    titre,
    message,
    icone: icone ?? (echec ? 'alert-circle-outline' : 'check-decagram-outline'),
    ton: echec ? 'danger' : 'marque',
    boutons: [{ libelle: 'Compris', valeur: 'ok' }],
  }).catch(() => undefined);
}
