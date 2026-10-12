import { useQuery } from '@tanstack/react-query'
import { fetchPlateforme } from '../api'
import type { Plateforme } from '../types'

const PAR_DEFAUT: Plateforme = {
  nom: 'Volteo',
  logoUrl: null,
  devise: 'DT',
  langue: 'fr',
  fuseauHoraire: 'Africa/Tunis',
}

export function usePlateforme(): Plateforme {
  const { data } = useQuery({ queryKey: ['plateforme'], queryFn: fetchPlateforme, staleTime: 5 * 60_000 })
  return data ?? PAR_DEFAUT
}
