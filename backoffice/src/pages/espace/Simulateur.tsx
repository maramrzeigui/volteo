import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Select } from 'antd'
import { ApiOutlined, CheckOutlined, IdcardOutlined, PoweroffOutlined, ThunderboltFilled } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { errorMessage, espace } from '../../api'
import { useAuth } from '../../auth'
import { formatMontant, formatNombre } from '../../format'
import type { EtatSimulateur } from '../../types'
import { useSoldeEnDirect } from '../../hooks/useSoldeEnDirect'

const ETAPES = ['Présenter le badge', 'Autorisation OCPP', 'Véhicule branché', 'Recharge en cours', 'Session clôturée']
const TVA = 0.19

/** Durée écoulée « 00:24:34 ». */
function chrono(debut: string | null, fin: string | null) {
  if (!debut) return '00:00:00'
  const s = Math.max(0, dayjs(fin ?? undefined).diff(dayjs(debut), 'second'))
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
}

/**
 * Simulateur de recharge au badge RFID : le client présente son vrai badge à une borne du simulateur
 * SAP, branche son véhicule, puis la borne échange de vraies trames OCPP 1.6 avec la supervision.
 * La session, la facture et le débit du wallet sont réels.
 */
export default function EspaceSimulateur() {
  const { user, rafraichir } = useAuth()
  const { solde } = useSoldeEnDirect()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { data: ctx, error } = useQuery({ queryKey: ['espace', 'simulateur'], queryFn: espace.simulateur })
  const [borneId, setBorneId] = useState<number>()
  const [badgeId, setBadgeId] = useState<number>()
  const [vehiculeId, setVehiculeId] = useState<number>()
  const [autorisation, setAutorisation] = useState<string | null>(null)
  const [branche, setBranche] = useState(false)
  const [action, setAction] = useState<string | null>(null)
  const [, forcer] = useState(0)
  const journalRef = useRef<HTMLDivElement>(null)
  const sessionSuivie = useRef<number | null>(null)

  useEffect(() => {
    if (!ctx) return
    setBorneId((b) => b ?? ctx.bornes[0]?.id)
    setBadgeId((b) => b ?? ctx.badges.find((x) => x.statut === 'Accepted')?.id ?? ctx.badges[0]?.id)
    setVehiculeId((v) => v ?? ctx.vehicules[0]?.id)
  }, [ctx])

  const { data: etat } = useQuery({
    queryKey: ['espace', 'simulateur', borneId],
    queryFn: () => espace.etatSimulateur(borneId!),
    enabled: !!borneId,
    refetchInterval: 2000,
  })

  // Chronomètre de la recharge en direct.
  useEffect(() => {
    const t = setInterval(() => forcer((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    journalRef.current?.scrollTo({ top: journalRef.current.scrollHeight })
  }, [etat?.journal.length])

  const borne = ctx?.bornes.find((b) => b.id === borneId)
  const badge = ctx?.badges.find((b) => b.id === badgeId)
  const vehicule = ctx?.vehicules.find((v) => v.id === vehiculeId)
  const connecteur = etat?.borne?.connecteurs[0]
  const session: EtatSimulateur['session'] = etat?.session ?? null
  const active = !!session && ['en_cours', 'en_pause'].includes(session.etat) && !!connecteur?.enCharge
  // La session affichée est celle démarrée pendant cette visite (ou celle en cours).
  const sessionVisible = session && (active || session.id === sessionSuivie.current) ? session : null
  const close = !!sessionVisible && !active && sessionVisible.etat === 'terminee'

  const etape = close ? 4 : active ? 3 : branche ? 2 : autorisation === 'Accepted' ? 2 : autorisation ? 1 : 0

  useEffect(() => {
    if (active && session) sessionSuivie.current = session.id
  }, [active, session])
  useEffect(() => {
    if (close) {
      void rafraichir()
      void queryClient.invalidateQueries({ queryKey: ['espace'] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [close])

  const lancer = async (nom: 'badge' | 'brancher' | 'demarrer' | 'arreter') => {
    if (!borneId) return
    setAction(nom)
    try {
      const r = await espace.actionSimulateur(borneId, nom, { badge_id: badgeId, connecteur: connecteur?.id ?? 1 })
      if (nom === 'badge') {
        setAutorisation(r.autorisation)
        if (r.autorisation !== 'Accepted') message.error(`Badge refusé (${r.autorisation}) : ${r.message}`, 8)
      }
      if (nom === 'brancher') setBranche(true)
      if (nom === 'arreter') setBranche(false)
      void queryClient.invalidateQueries({ queryKey: ['espace', 'simulateur', borneId] })
    } catch (e) {
      message.error(errorMessage(e))
    } finally {
      setAction(null)
    }
  }

  const recommencer = () => {
    setAutorisation(null)
    setBranche(false)
    sessionSuivie.current = null
  }

  const capacite = vehicule?.capaciteBatterieKwh ?? 60
  const batterie = sessionVisible?.batterie ?? null
  const ht = (sessionVisible?.prix ?? 0) / (1 + TVA)
  const lignes = useMemo(() => (etat?.journal ?? []).slice(-40), [etat?.journal])

  if (error) return <div className="bornes-client-vide"><strong>Simulateur indisponible</strong><span>{errorMessage(error)}</span></div>

  return (
    <div className="simulateur">
      <header className="simulateur-entete">
        <div>
          <h1>Recharger avec mon badge</h1>
          <p>Présentez votre badge RFID à une borne, branchez votre véhicule : la borne dialogue en OCPP 1.6 avec Volteo, comme sur le terrain.</p>
        </div>
        <div className="simulateur-choix">
          <Select size="large" value={borneId} onChange={(v) => { setBorneId(v); recommencer() }} disabled={active} placeholder="Borne" style={{ minWidth: 220 }}
            options={(ctx?.bornes ?? []).map((b) => ({ value: b.id, label: `${b.nom} · ${b.puissanceKw} kW` }))} />
          <Select size="large" value={badgeId} onChange={setBadgeId} disabled={active} placeholder="Badge" style={{ minWidth: 170 }}
            options={(ctx?.badges ?? []).map((b) => ({ value: b.id, label: `${b.uid}${b.statut !== 'Accepted' ? ' (bloqué)' : ''}` }))} />
          <Select size="large" value={vehiculeId} onChange={setVehiculeId} disabled={active} placeholder="Véhicule" style={{ minWidth: 200 }}
            options={(ctx?.vehicules ?? []).map((v) => ({ value: v.id, label: `${v.marque} ${v.modele}` }))} />
        </div>
      </header>

      <ol className="simulateur-etapes">
        {ETAPES.map((libelle, i) => (
          <li key={libelle} className={i < etape ? 'faite' : i === etape ? 'active' : undefined}>
            <span>{i < etape ? <CheckOutlined /> : i + 1}</span>{libelle}
          </li>
        ))}
      </ol>

      <section className={`simulateur-scene${branche || active ? ' branche' : ''}${active ? ' en-charge' : ''}`}>
        <figure className="simulateur-borne">
          <div className="simulateur-borne-photo" style={{ backgroundImage: borne?.photoUrl ? `url(${borne.photoUrl})` : undefined }} />
          <figcaption>
            <strong>{borne?.nom ?? '—'}</strong>
            <span className={`simulateur-pastille ${connecteur?.statut?.toLowerCase() ?? ''}`}>{
              { Available: 'Borne disponible', Preparing: 'Véhicule connecté', Charging: 'Recharge en cours', Finishing: 'Fin de recharge', SuspendedEV: 'En pause (véhicule)', Faulted: 'En défaut' }[connecteur?.statut ?? ''] ??
              (etat?.borne?.connectee ? connecteur?.statut : 'Hors ligne')
            }</span>
            {borne?.photoCredit && <small>© {borne.photoCredit.split(' · ')[0]}</small>}
          </figcaption>
        </figure>

        <div className={`simulateur-badge${autorisation ? (autorisation === 'Accepted' ? ' accepte' : ' refuse') : ''}`}>
          <div className="carte-rfid">
            <span className="carte-rfid-marque"><ThunderboltFilled /> Volteo</span>
            <span className="carte-rfid-puce" />
            <span className="carte-rfid-ondes">)))</span>
            <strong>{badge?.uid ?? '—'}</strong>
            <small>{user?.prenom} {user?.nom}</small>
          </div>
          {autorisation && <span className="simulateur-autorisation">{autorisation === 'Accepted' ? 'Autorisé · Accepted' : `Refusé · ${autorisation}`}</span>}
        </div>

        <figure className="simulateur-voiture">
          {vehicule?.photoUrl ? <img src={vehicule.photoUrl} alt={`${vehicule.marque} ${vehicule.modele}`} /> : <div className="photo-borne-nuit"><ThunderboltFilled /></div>}
          <figcaption>
            <strong>{vehicule ? `${vehicule.marque} ${vehicule.modele}` : 'Aucun véhicule'}</strong>
            {vehicule?.photoCredit && <small>© {vehicule.photoCredit.split(' · ')[0]}</small>}
          </figcaption>
        </figure>

        <svg className="simulateur-cable" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden>
          <path d="M120 60 C 300 190, 700 190, 880 60" />
          <path className="flux" d="M120 60 C 300 190, 700 190, 880 60" />
        </svg>
      </section>

      <div className="simulateur-actions">
        {etape === 0 || (etape === 1 && autorisation !== 'Accepted') ? (
          <Button type="primary" size="large" icon={<IdcardOutlined />} loading={action === 'badge'} disabled={!badge || !etat?.borne?.connectee} onClick={() => lancer('badge')}>Présenter le badge</Button>
        ) : etape === 2 && !branche ? (
          <Button type="primary" size="large" icon={<ApiOutlined />} loading={action === 'brancher'} onClick={() => lancer('brancher')}>Brancher le câble</Button>
        ) : etape === 2 ? (
          <Button type="primary" size="large" icon={<ThunderboltFilled />} loading={action === 'demarrer'} onClick={() => lancer('demarrer')}>Démarrer la recharge</Button>
        ) : etape === 3 ? (
          <Button danger type="primary" size="large" icon={<PoweroffOutlined />} loading={action === 'arreter'} onClick={() => lancer('arreter')}>Arrêter la recharge</Button>
        ) : (
          <>
            <Button size="large" onClick={recommencer}>Nouvelle recharge</Button>
            <Link to="/espace/paiements"><Button size="large" type="primary">Voir la facture</Button></Link>
          </>
        )}
        {etat?.erreur && <span className="simulateur-erreur">{etat.erreur}</span>}
        {!etat?.borne?.connectee && etat && !etat.erreur && <span className="simulateur-erreur">Borne hors ligne : démarrez le simulateur SAP.</span>}
      </div>

      <div className="simulateur-panneaux">
        <section>
          <h3>Client</h3>
          <dl>
            <div><dt>Nom et prénom</dt><dd>{user?.prenom} {user?.nom}</dd></div>
            <div><dt>Identifiant client</dt><dd>{user?.id}</dd></div>
            <div><dt>Badge RFID</dt><dd className="mono">{badge?.uid ?? '—'}</dd></div>
            <div><dt>Solde disponible</dt><dd>{formatMontant(solde)}</dd></div>
          </dl>
        </section>
        <section>
          <h3>Véhicule</h3>
          <dl>
            <div><dt>Marque</dt><dd>{vehicule?.marque ?? '—'}</dd></div>
            <div><dt>Modèle</dt><dd>{vehicule?.modele ?? '—'}</dd></div>
            <div><dt>Immatriculation</dt><dd className="mono">{vehicule?.immatriculation ?? '—'}</dd></div>
            <div><dt>Capacité batterie</dt><dd>{capacite} kWh</dd></div>
            <div><dt>Batterie (SoC borne)</dt><dd>{batterie != null ? `${batterie} %` : '—'}</dd></div>
          </dl>
          {batterie != null && <div className="simulateur-jauge"><i style={{ width: `${batterie}%` }} /></div>}
        </section>
        <section>
          <h3>Recharge</h3>
          <div className="simulateur-chrono">{chrono(sessionVisible?.debut ?? null, active ? null : (sessionVisible?.fin ?? null))}</div>
          <dl>
            <div><dt>État</dt><dd>{active ? 'Recharge en cours' : close ? 'Session clôturée' : '—'}</dd></div>
            <div><dt>Transaction OCPP</dt><dd className="mono">{sessionVisible?.transactionOcpp ?? connecteur?.transactionId ?? '—'}</dd></div>
            <div><dt>Énergie consommée</dt><dd>{formatNombre(sessionVisible?.energieKwh ?? 0, 3)} kWh</dd></div>
            <div><dt>Puissance instantanée</dt><dd>{formatNombre(active ? (sessionVisible?.puissanceKw ?? 0) : 0, 1)} kW</dd></div>
            <div><dt>Coût HT</dt><dd>{formatMontant(ht, 3)}</dd></div>
            <div><dt>Coût TTC (TVA 19 %)</dt><dd className="cuivre">{formatMontant(sessionVisible?.prix ?? 0, 3)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="simulateur-journal">
        <h3>Dialogue OCPP 1.6 <small>trames réelles échangées avec la borne {borne?.reference}</small></h3>
        <div ref={journalRef}>
          {lignes.map((l, i) => {
            const [type, , nom, charge] = l.trame as [number, string, string | object, object]
            const action = type === 2 ? String(nom) : type === 3 ? 'Réponse' : 'Erreur'
            return (
              <p key={i} className={l.sens}>
                <time>{dayjs(l.t).format('HH:mm:ss')}</time>
                <span>{l.sens === 'entrant' ? 'Borne → Volteo' : 'Volteo → Borne'}</span>
                <b>{action}</b>
                <code>{JSON.stringify(type === 2 ? charge : nom)}</code>
              </p>
            )
          })}
          {!lignes.length && <p className="vide">Aucune trame pour le moment : présentez votre badge.</p>}
        </div>
      </section>
    </div>
  )
}
