import { useCallback, useState } from 'react'

const CLE = 'borneapp.favoris'
function lire(): number[] {
  try {
    return JSON.parse(localStorage.getItem(CLE) ?? '[]') as number[]
  } catch {
    return []
  }
}

/** Bornes favorites, gardées dans ce navigateur (comme sur le téléphone). */
export function useFavoris() {
  const [ids, setIds] = useState<Set<number>>(() => new Set(lire()))
  const basculer = useCallback((id: number) => {
    setIds((avant) => {
      const n = new Set(avant)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      try {
        localStorage.setItem(CLE, JSON.stringify([...n]))
      } catch {
        // Stockage indisponible (navigation privée) : favoris pour cette visite seulement.
      }
      return n
    })
  }, [])
  return { ids, basculer }
}
