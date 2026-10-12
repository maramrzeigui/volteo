import { useEffect, useState } from 'react'
import { Spin } from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, espace } from '../../api'

/**
 * Lien du QR code collé sur une borne (/b/BRN-…) : retrouve la borne par sa référence
 * et ouvre sa fiche, prête pour « Démarrer ». Sans connexion, la page de connexion
 * s'affiche d'abord puis revient ici automatiquement.
 */
export default function OuvrirBorne() {
  const { reference = '' } = useParams()
  const navigate = useNavigate()
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    espace
      .borne(reference)
      .then((b) => navigate(`/espace/bornes/${b.id}`, { replace: true }))
      .catch((e) => setErreur(errorMessage(e, 'Borne introuvable.')))
  }, [reference, navigate])

  return (
    <div className="bornes-client-vide">
      {erreur ? (
        <>
          <strong>Borne {reference} introuvable</strong>
          <span>{erreur}</span>
          <Link to="/espace/bornes">Voir toutes les bornes</Link>
        </>
      ) : (
        <>
          <Spin size="large" />
          <span>Ouverture de la borne {reference}…</span>
        </>
      )}
    </div>
  )
}
