import { useMemo, useState } from 'react'
import { Input, Skeleton } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { espace } from '../../api'
import CarteBorneClient from '../../components/CarteBorneClient'
import { useFavoris } from '../../hooks/useFavoris'
import type { Borne } from '../../types'

type Filtre = 'toutes' | 'disponibles' | 'rapides' | 'favoris' | 'publiques'
const rang = (b: Borne) => (b.source === 'publique' ? 3 : b.etat === 'disponible' ? 0 : b.etat === 'occupee' ? 1 : 2)

/** Liste des bornes : même écran que l'onglet « Bornes » de l'application. */
export default function EspaceBornes() {
  const { ids: favoris } = useFavoris()
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('toutes')
  const { data: bornes, isLoading } = useQuery({ queryKey: ['espace', 'bornes'], queryFn: espace.bornes, refetchInterval: 30_000 })
  const liste = useMemo(() => bornes ?? [], [bornes])

  const filtres: { cle: Filtre; libelle: string; test: (b: Borne) => boolean }[] = [
    { cle: 'toutes', libelle: 'Toutes', test: () => true },
    { cle: 'disponibles', libelle: 'Disponibles', test: (b) => b.etat === 'disponible' },
    { cle: 'rapides', libelle: 'Charge rapide', test: (b) => b.source !== 'publique' && (b.puissanceKw ?? 0) >= 50 },
    { cle: 'favoris', libelle: 'Favoris', test: (b) => favoris.has(b.id) },
    { cle: 'publiques', libelle: 'Autres réseaux', test: (b) => b.source === 'publique' },
  ]
  const terme = recherche.trim().toLowerCase()
  const test = filtres.find((f) => f.cle === filtre)!.test
  const visibles = liste
    .filter(test)
    .filter((b) => !terme || [b.nom, b.adresse, b.reference, b.operateur ?? ''].some((t) => t?.toLowerCase().includes(terme)))
    .sort((a, b) => rang(a) - rang(b) || a.nom.localeCompare(b.nom))
  const libres = liste.filter((b) => b.etat === 'disponible').length

  return (
    <div className="bornes-client">
      <header className="bornes-client-entete">
        <h1>Bornes</h1>
        <p>{bornes ? <>{liste.length} en Tunisie · <b>{libres} libres maintenant</b></> : 'Chargement du réseau…'}</p>
        <Input size="large" allowClear prefix={<SearchOutlined />} placeholder="Rechercher : ville, nom, opérateur" value={recherche} onChange={(e) => setRecherche(e.target.value)} className="bornes-client-recherche" />
        <div className="pastilles-filtres">
          {filtres.map((f) => (
            <button key={f.cle} type="button" className={filtre === f.cle ? 'actif' : undefined} onClick={() => setFiltre(f.cle)}>
              {f.libelle} <span>{liste.filter(f.test).length}</span>
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <div className="grille-bornes-client">{[0, 1, 2].map((i) => <Skeleton.Node key={i} active style={{ width: '100%', height: 300, borderRadius: 24 }} />)}</div>
      ) : visibles.length ? (
        <div className="grille-bornes-client">
          {visibles.map((b, i) => (
            <div key={b.id} className="apparition" style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
              <CarteBorneClient borne={b} favori={favoris.has(b.id)} />
            </div>
          ))}
        </div>
      ) : (
        <div className="bornes-client-vide">
          <strong>{filtre === 'favoris' ? 'Aucune borne favorite' : 'Aucune borne trouvée'}</strong>
          <span>{filtre === 'favoris' ? 'Ajoutez une borne à vos favoris depuis sa fiche pour la retrouver ici.' : 'Essayez un autre mot-clé ou un autre filtre.'}</span>
        </div>
      )}
    </div>
  )
}
