import { useEffect, useRef, useState } from 'react'
import { Button } from 'antd'
import { CheckOutlined, StopOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth'
import dayjs from 'dayjs'
import { errorMessage, espace } from '../../api'
import Dialogue from '../../components/Dialogue'
import Graphique from '../../components/Graphique'
import { VoitureRecharge } from '../../components/VoitureRecharge'
import { formatDuree, formatNombre } from '../../format'
import type { SessionClient } from '../../types'

const OBJECTIFS = [80, 90, 100]

/** Recharge en cours, comme l'écran de l'application : voiture, objectif, mesures en direct, arrêt et résumé. */
export default function EspaceRecharge() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { rafraichir } = useAuth()
  const [objectif, setObjectif] = useState(80)
  const [confirmation, setConfirmation] = useState(false)
  const [arret, setArret] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [terminee, setTerminee] = useState<SessionClient | null>(null)
  const derniere = useRef<SessionClient | null>(null)

  const { data: session, isLoading } = useQuery({ queryKey: ['espace', 'active'], queryFn: espace.sessionActive, refetchInterval: 4000 })
  const { data: mesures } = useQuery({
    queryKey: ['espace', 'mesures', session?.id],
    queryFn: () => espace.mesures(session!.id),
    enabled: !!session,
    refetchInterval: 4000,
  })
  const { data: vehicules } = useQuery({ queryKey: ['espace', 'vehicules'], queryFn: espace.vehicules })

  // Fin côté borne ou back-office : on affiche le résumé depuis l'historique.
  useEffect(() => {
    if (session) {
      derniere.current = session
      return
    }
    const avant = derniere.current
    if (avant && !terminee) {
      derniere.current = null
      espace
        .sessions()
        .then((s) => setTerminee(s.find((x) => x.id === avant.id) ?? avant))
        .catch(() => setTerminee(avant))
    }
  }, [session, terminee])

  const arreter = async () => {
    if (!session) return
    setArret(true)
    try {
      const finale = await espace.arreter(session.id)
      derniere.current = null
      setTerminee(finale)
      setConfirmation(false)
      void queryClient.invalidateQueries({ queryKey: ['espace'] })
      void rafraichir()
    } catch (e) {
      setConfirmation(false)
      setErreur(errorMessage(e, 'Réessayez dans un instant.'))
    } finally {
      setArret(false)
    }
  }

  const batterie = session?.pourcentageBatterie ?? null
  const connexion = !!session && !session.puissanceInstantaneeKw && !session.energieKwh
  const pause = session?.etat === 'en_pause'
  const capacite = vehicules?.[0]?.capaciteBatterieKwh ?? 60
  const fin =
    session && batterie != null && session.puissanceInstantaneeKw && batterie < objectif
      ? dayjs().add(((objectif - batterie) / 100) * capacite / session.puissanceInstantaneeKw, 'hour')
      : null

  return (
    <div className="recharge-web">
      <div className="recharge-barre">
        <button type="button" className="recharge-fermer" onClick={() => navigate('/espace')}>Fermer</button>
        {session && <span className={`recharge-direct${pause ? ' pause' : ''}`}><i />{pause ? 'En pause' : 'En direct'}</span>}
      </div>

      {session ? (
        <>
          <div className="recharge-titre">
            <span>{session.typeConnecteur === 'Type2' ? 'Type 2' : session.typeConnecteur} · depuis {formatDuree(dayjs().diff(dayjs(session.dateDebut), 'minute'))}</span>
            <h2>{session.borneNom}</h2>
          </div>
          <div className="recharge-centre">
            <strong>{batterie != null ? batterie : formatNombre(session.energieKwh, 1)}<small>{batterie != null ? '%' : 'kWh'}</small></strong>
            <span className={pause ? 'avertissement' : undefined}>
              {connexion ? 'Connexion à la voiture…' : pause ? 'Recharge suspendue par l’exploitant' : fin ? `${objectif} % vers ${fin.format('HH:mm')}` : 'Énergie transmise'}
            </span>
          </div>
          <div className="recharge-scene"><VoitureRecharge batterie={batterie ?? 50} enCharge={!pause} /></div>

          <div className="recharge-objectifs">
            <span className="libelle">Objectif</span>
            <div>
              {OBJECTIFS.map((o) => (
                <button key={o} type="button" className={o === objectif ? 'actif' : undefined} onClick={() => setObjectif(o)}>{o} %</button>
              ))}
            </div>
          </div>

          <div className="recharge-grille">
            {[
              { l: 'Puissance', v: session.puissanceInstantaneeKw ? formatNombre(session.puissanceInstantaneeKw, 0) : '—', u: 'kW' },
              { l: 'Énergie', v: formatNombre(session.energieKwh, 1), u: 'kWh' },
              { l: 'Coût', v: formatNombre(session.prix, 2), u: 'DT', cout: true },
            ].map((m) => (
              <div key={m.l}>
                <strong className={m.cout ? 'cout' : undefined}>{m.v}<small>{m.u}</small></strong>
                <span className="libelle">{m.l}</span>
              </div>
            ))}
          </div>

          {session.budget != null && session.budget > 0 && (
            <div className="recharge-budget">
              <div><span>Solde restant</span><strong>{formatNombre(Math.max(0, session.budget - session.prix), 2)} DT</strong></div>
              <div><span>Déjà consommé</span><span>{formatNombre(session.prix, 2)} DT sur {formatNombre(session.budget, 2)} DT</span></div>
              <div className="recharge-budget-jauge"><i style={{ width: `${Math.min(100, (session.prix / session.budget) * 100)}%` }} /></div>
              <small>La recharge s’arrête automatiquement quand votre solde est atteint : vous ne payez jamais plus que ce que vous avez.</small>
            </div>
          )}

          <div className="recharge-courbe">
            <div className="recharge-courbe-entete"><h3>Puissance délivrée</h3><span>mesures de la borne</span></div>
            {mesures && mesures.length > 1 ? (
              <Graphique
                style={{ height: 200 }}
                option={{
                  grid: { left: 36, right: 12, top: 12, bottom: 24 },
                  xAxis: { type: 'time', axisLabel: { formatter: '{HH}:{mm}' } },
                  yAxis: { type: 'value', name: 'kW' },
                  tooltip: { trigger: 'axis' },
                  series: [{ type: 'line', smooth: true, showSymbol: false, areaStyle: { opacity: 0.18 }, color: '#E5545F',
                    data: mesures.map((m) => [m.t, m.puissanceKw ?? 0]) }],
                }}
              />
            ) : (
              <p className="recharge-vide">La courbe apparaît dès les premières mesures de la borne.</p>
            )}
          </div>

          <Button size="large" block className="recharge-arreter" icon={<StopOutlined />} onClick={() => setConfirmation(true)}>Arrêter la recharge</Button>
        </>
      ) : terminee ? (
        <div className="recharge-resume">
          <span className="recharge-coche"><CheckOutlined /></span>
          <span className="libelle rouge">Recharge terminée</span>
          <h2>{terminee.borneNom}</h2>
          <div className="recharge-grille">
            <div><strong>{formatNombre(terminee.energieKwh, 1)}<small>kWh</small></strong><span className="libelle">Énergie</span></div>
            <div><strong className="cout">{formatNombre(terminee.prix, 2)}<small>DT</small></strong><span className="libelle">Facturé</span></div>
          </div>
          <p>
            {terminee.arretSolde
              ? 'Recharge arrêtée automatiquement : votre solde est atteint. Rechargez votre wallet pour continuer.'
              : terminee.prix > 0 ? 'Le montant a été débité de votre wallet. La facture est disponible dans votre compte.' : 'Aucun montant à payer pour cette recharge.'}
          </p>
          <Button type="primary" size="large" block onClick={() => navigate('/espace')}>Terminer</Button>
          <Button type="text" block onClick={() => navigate('/espace/recharges')}>Voir mes recharges</Button>
        </div>
      ) : !isLoading ? (
        <div className="recharge-resume">
          <h2>Aucune recharge en cours</h2>
          <p>Choisissez une borne disponible pour lancer une recharge.</p>
          <Button type="primary" size="large" block onClick={() => navigate('/espace/carte')}>Trouver une borne</Button>
        </div>
      ) : null}

      <Dialogue
        open={confirmation}
        icone={<StopOutlined />}
        titre="Arrêter la recharge ?"
        texte={`La session sur ${session?.borneNom ?? 'la borne'} sera terminée et facturée sur votre wallet.`}
        annuler="Continuer"
        confirmer="Arrêter"
        chargement={arret}
        onAnnuler={() => setConfirmation(false)}
        onConfirmer={arreter}
      />
      <Dialogue open={!!erreur} icone={<StopOutlined />} titre="Arrêt impossible" texte={erreur} confirmer="Compris" onConfirmer={() => setErreur(null)} />
    </div>
  )
}
