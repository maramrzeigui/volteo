import type { CouleurSemantique } from '@/constants/theme';
import type { StatutBadge, StatutPaiement } from '@/types/domain';

type Statut = { label: string; couleur: CouleurSemantique };

export const STATUT_PAIEMENT: Record<StatutPaiement, Statut> = {
  paye: { label: 'Payé', couleur: 'success' },
  en_attente: { label: 'À régler', couleur: 'warning' },
  rembourse: { label: 'Remboursé', couleur: 'info' },
  rembourse_partiel: { label: 'Remboursé en partie', couleur: 'info' },
  echoue: { label: 'Échoué', couleur: 'danger' },
};

export const STATUT_FACTURE: Record<string, Statut> = {
  payee: { label: 'Payée', couleur: 'success' },
  emise: { label: 'À régler', couleur: 'warning' },
  remboursee: { label: 'Remboursée', couleur: 'info' },
};

export const STATUT_BADGE: Record<StatutBadge, Statut> = {
  actif: { label: 'Actif', couleur: 'success' },
  inactif: { label: 'Inactif', couleur: 'neutral' },
  bloque: { label: 'Bloqué', couleur: 'danger' },
  expire: { label: 'Expiré', couleur: 'warning' },
  non_associe: { label: 'Non associé', couleur: 'neutral' },
};

export const METHODE_PAIEMENT: Record<string, string> = {
  wallet: 'Wallet',
  carte: 'Carte bancaire',
  topup_carte: 'Carte bancaire',
  ajustement: 'Geste commercial',
  especes: 'Espèces',
  virement: 'Virement',
};
