import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { espace } from '../api'
import { useAuth } from '../auth'

/**
 * Solde du wallet en direct : pendant une recharge, le prix en cours est déduit au fur et à mesure
 * (le débit définitif a lieu à la fin, au prix exact). À la fin de la recharge, le solde réel est relu.
 */
export function useSoldeEnDirect() {
  const { user, rafraichir } = useAuth()
  const { data: active } = useQuery({
    queryKey: ['espace', 'active'],
    queryFn: espace.sessionActive,
    enabled: user?.role === 'client',
    refetchInterval: (q) => (q.state.data ? 4000 : 15000),
  })
  const enCours = active?.prix ?? 0

  // Fin de recharge détectée : on recharge le profil pour afficher le solde réellement débité.
  const avant = useRef(false)
  useEffect(() => {
    if (avant.current && !active) void rafraichir()
    avant.current = !!active
  }, [active, rafraichir])

  const solde = user?.soldeWallet ?? 0
  return { solde: Math.max(0, solde - enCours), enCours, soldeAvantRecharge: solde, enCharge: !!active }
}
