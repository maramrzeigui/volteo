import { AimOutlined, FlagOutlined, NodeIndexOutlined, SearchOutlined, StarFilled } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { espace } from '../api'

/** Carte « Trajet Volta » de l'accueil, comme dans l'application : recherche et villes en un clic. */
export default function TrajetVoltaCarte() {
  const navigate = useNavigate()
  const { data: villes = [] } = useQuery({ queryKey: ['espace', 'villes'], queryFn: espace.villes, staleTime: 3_600_000 })
  const aller = (v: { nom: string; lat: number; lng: number }) =>
    navigate(`/espace/trajet?nom=${encodeURIComponent(v.nom)}&lat=${v.lat}&lng=${v.lng}`)

  return (
    <section className="trajet-volta-carte">
      <div className="trajet-volta-haut">
        <span className="trajet-volta-icone"><NodeIndexOutlined /></span>
        <span className="trajet-volta-titre">Trajet Volta</span>
        <span className="trajet-volta-ia"><StarFilled /> IA</span>
      </div>
      <Link to="/espace/trajet" className="trajet-volta-recherche" aria-label="Où voulez-vous aller ?">
        <SearchOutlined className="rouge" />
        <span>Où voulez-vous aller ?</span>
        <AimOutlined className="viseur" />
      </Link>
      {villes.length > 0 && (
        <div className="trajet-volta-villes">
          {villes.map((v) => (
            <button key={v.cle} type="button" onClick={() => aller(v)}><FlagOutlined /> {v.nom}</button>
          ))}
        </div>
      )}
      <p>Volta part de votre position, vérifie si votre batterie suffit et vous dit où recharger.</p>
    </section>
  )
}
