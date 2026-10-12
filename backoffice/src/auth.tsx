import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clearAuth, fetchMe, getStoredUser, logout as apiLogout, setOnUnauthorized, storeAuth, storeUser } from './api'
import type { Module, Niveau, User } from './types'

interface AuthContexte {
  user: User | null
  estPersonnel: boolean
  connecter: (token: string, user: User) => void
  deconnecter: () => Promise<void>
  rafraichir: () => Promise<void>
  /** Le rôle donne-t-il au moins ce niveau sur le module (§7) ? */
  peut: (module: Module, niveau?: Niveau) => boolean
}

const Contexte = createContext<AuthContexte | null>(null)

const RANG: Record<Niveau, number> = { aucun: 0, lecture: 1, ecriture: 2 }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser())
  const queryClient = useQueryClient()

  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null)
      queryClient.clear()
    })
  }, [queryClient])

  const rafraichir = useCallback(async () => {
    try {
      const frais = await fetchMe()
      storeUser(frais)
      setUser(frais)
    } catch {
      // 401 géré par l'intercepteur ; erreur réseau : on garde l'utilisateur en cache.
    }
  }, [])

  // Permissions toujours à jour (la matrice peut changer côté serveur).
  useEffect(() => {
    if (getStoredUser()) void rafraichir()
  }, [rafraichir])

  const connecter = useCallback((token: string, u: User) => {
    storeAuth(token, u)
    setUser(u)
  }, [])

  const deconnecter = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      // Même en cas d'échec réseau, on déconnecte localement.
    }
    clearAuth()
    queryClient.clear()
    setUser(null)
  }, [queryClient])

  const valeur = useMemo<AuthContexte>(
    () => ({
      user,
      estPersonnel: !!user && user.role !== 'client',
      connecter,
      deconnecter,
      rafraichir,
      peut: (module, niveau = 'lecture') =>
        !!user && user.role !== 'client' && RANG[user.permissions?.[module] ?? 'aucun'] >= RANG[niveau],
    }),
    [user, connecter, deconnecter, rafraichir],
  )

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContexte {
  const ctx = useContext(Contexte)
  if (!ctx) throw new Error('useAuth hors AuthProvider')
  return ctx
}
