import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import * as api from '@/lib/api';
import type { Utilisateur } from '@/types/domain';

interface AuthContextValue {
  utilisateur: Utilisateur | null;
  chargement: boolean;
  /** Retourne `true` si un code 2FA est attendu (envoyé par email). */
  connexion: (email: string, motDePasse: string) => Promise<boolean>;
  verifier2fa: (email: string, code: string) => Promise<void>;
  /** Connexion avec un ID token Google (crée le compte client au premier passage). */
  connexionGoogle: (idToken: string) => Promise<void>;
  inscription: (payload: {
    nom: string;
    prenom: string;
    email: string;
    telephone?: string;
    motDePasse: string;
  }) => Promise<void>;
  deconnexion: () => Promise<void>;
  rafraichirProfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    // Jeton refusé par l'API : retour immédiat à l'écran de connexion.
    api.quandNonAutorise(() => setUtilisateur(null));
    return () => api.quandNonAutorise(null);
  }, []);

  useEffect(() => {
    // Restaure la session si un token est déjà stocké.
    api
      .profil()
      .then(setUtilisateur)
      .catch(() => setUtilisateur(null))
      .finally(() => setChargement(false));
  }, []);

  const connexion = useCallback(async (email: string, motDePasse: string) => {
    const user = await api.login(email, motDePasse);
    if (!user) return true; // 2FA requise
    setUtilisateur(user);
    return false;
  }, []);

  const verifier2fa = useCallback(async (email: string, code: string) => {
    setUtilisateur(await api.verifier2fa(email, code));
  }, []);

  const connexionGoogle = useCallback(async (idToken: string) => {
    setUtilisateur(await api.connexionGoogle(idToken));
  }, []);

  const inscription = useCallback(
    async (payload: { nom: string; prenom: string; email: string; telephone?: string; motDePasse: string }) => {
      setUtilisateur(await api.register(payload));
    },
    []
  );

  const deconnexion = useCallback(async () => {
    await api.logout();
    setUtilisateur(null);
  }, []);

  const rafraichirProfil = useCallback(async () => {
    const user = await api.profil();
    if (user) setUtilisateur(user);
  }, []);

  return (
    <AuthContext
      value={{
        utilisateur,
        chargement,
        connexion,
        verifier2fa,
        connexionGoogle,
        inscription,
        deconnexion,
        rafraichirProfil,
      }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé sous <AuthProvider>');
  return ctx;
}
