import { useMemo, useState } from 'react'
import { App, Slider } from 'antd'
import { AimOutlined, ArrowLeftOutlined, CheckCircleFilled, RightOutlined, ThunderboltFilled } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { errorMessage, espace } from '../../api'
import { borneIndisponible, EtatPastille, NOM_PRISE, PhotoBorne, UNITE_TARIF } from '../../components/CarteBorneClient'
import { useFavoris } from '../../hooks/useFavoris'
import { usePlateforme } from '../../hooks/usePlateforme'
import { useAuth } from '../../auth'
import { ModalePaiement } from '../../components/PaiementEnLigne'
import { formatDuree, formatNombre, formatRelatif } from '../../format'
import type { Connecteur } from '../../types'
import IconeVolta from '../../components/IconeVolta'

const enHeuresCreuses = (debut: string | null, fin: string | null) => {
  if (!debut || !fin) return false
  const h = dayjs().format('HH:mm')
  return debut <= fin ? h >= debut && h < fin : h >= debut || h < fin
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return <div className="fiche-ligne"><span>{libelle}</span><strong>{valeur}</strong></div>
}

/** Fiche d'une borne : même écran que dans l'application (photo, prises, estimation, démarrage). */
export default function EspaceBorneFiche() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { ids: favoris, basculer } = useFavoris()
  const { data: bornes, isLoading } = useQuery({ queryKey: ['espace', 'bornes'], queryFn: espace.bornes, refetchInterval: 15_000 })
  const { data: vehicules } = useQuery({ queryKey: ['espace', 'vehicules'], queryFn: espace.vehicules })
  const { data: active } = useQuery({ queryKey: ['espace', 'active'], queryFn: espace.sessionActive })
  const borne = bornes?.find((b) => String(b.id) === id)
  const [prise, setPrise] = useState<Connecteur | null>(null)
  const [batterie, setBatterie] = useState(30)
  const [objectif, setObjectif] = useState(80)
  const vehicule = vehicules?.[0]
  const { user } = useAuth()
  const { soldeMinimumRecharge = 10 } = usePlateforme()
  const { data: paiements } = useQuery({ queryKey: ['espace', 'paiements'], queryFn: espace.paiements })
  const [recharge, setRecharge] = useState(false)
  const impaye = (paiements ?? []).filter((p) => p.statut === 'en_attente').reduce((t, p) => t + p.montant, 0)
  // Paiement garanti : même règle que le serveur (solde minimum, aucune recharge impayée).
  const blocage = impaye > 0 ? 'impaye' : (user?.soldeWallet ?? 0) < soldeMinimumRecharge ? 'solde' : null

  const demarrage = useMutation({
    mutationFn: () => espace.demarrer(borne!.id, prise!.id, vehicule?.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['espace'] })
      navigate('/espace/recharge')
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const tarif = borne?.tarifApplique ?? (borne ? { nom: 'Prix au kWh', mode: 'kwh' as const, prix: borne.tarifKwh, prixHeuresCreuses: null, heuresCreusesDebut: null, heuresCreusesFin: null, fraisSession: 0, special: false, valideAu: null } : null)
  const creuses = !!tarif && tarif.prixHeuresCreuses != null && enHeuresCreuses(tarif.heuresCreusesDebut, tarif.heuresCreusesFin)
  const prixActuel = tarif ? (creuses ? tarif.prixHeuresCreuses! : tarif.prix) : 0

  const estimation = useMemo(() => {
    if (!prise || objectif <= batterie) return null
    const capacite = vehicule?.capaciteBatterieKwh ?? 60
    const energieKwh = ((objectif - batterie) / 100) * capacite
    const minutes = Math.round((energieKwh / Math.max(3, prise.puissanceKw * 0.85)) * 60)
    const prix = tarif?.mode === 'kwh' ? energieKwh * prixActuel : tarif?.mode === 'minute' ? minutes * prixActuel : (minutes / 60) * prixActuel
    return { energieKwh, minutes, prix: prix + (tarif?.fraisSession ?? 0), km: energieKwh * 6 }
  }, [prise, batterie, objectif, vehicule, tarif, prixActuel])

  if (isLoading) return <div className="chargement-page" />
  if (!borne) return <div className="bornes-client-vide"><strong>Borne introuvable</strong><Link to="/espace/bornes">Retour aux bornes</Link></div>

  const publique = borne.source === 'publique'
  const horsService = borneIndisponible(borne)
  const libres = borne.connecteurs.filter((c) => c.etat === 'disponible').length
  const favori = favoris.has(borne.id)
  const question = `Parle-moi de la borne ${borne.nom} (${borne.reference}) : disponibilité, tarif et prix d’une recharge de 20 à 80 %.`

  return (
    <div className="fiche-borne">
      <section className="fiche-hero">
        <PhotoBorne borne={borne} hauteur="100%" className="fiche-hero-photo" />
        <div className="fiche-hero-barre">
          <button type="button" onClick={() => navigate(-1)}><ArrowLeftOutlined /> Retour</button>
          <button type="button" className={favori ? 'actif' : undefined} onClick={() => basculer(borne.id)}>{favori ? 'Dans mes favoris' : 'Ajouter aux favoris'}</button>
        </div>
        <div className="fiche-hero-titres">
          <span className={publique ? undefined : 'rouge'}>{publique ? (borne.operateur ?? 'Autre opérateur') : `Réseau Volteo · ${borne.reference}`}</span>
          <h1>{borne.nom}</h1>
          <p>{borne.adresse}</p>
          <EtatPastille etat={borne.etat} />
        </div>
        <div className="fiche-hero-chiffres">
          <div><span>Puissance</span><strong>{borne.puissanceKw ?? '—'}<small> kW</small></strong></div>
          {!publique && tarif && (
            <>
              <div><span className={tarif.special ? 'rouge' : undefined}>{tarif.special ? 'Tarif promo' : creuses ? 'Heures creuses' : 'Tarif'}</span><strong>{formatNombre(prixActuel, 2)}<small> DT/{UNITE_TARIF[tarif.mode]}</small></strong></div>
              <div><span>Prises libres</span><strong>{libres}<small> / {borne.connecteurs.length}</small></strong></div>
            </>
          )}
        </div>
      </section>

      <div className="fiche-corps">
        {horsService && <div className="fiche-alerte">Cette borne n’accepte pas de recharge pour le moment ({borne.etat.replace('_', ' ')}). Choisissez une autre borne à proximité.</div>}
        {!publique && blocage && (
          <div className="fiche-solde">
            <strong>{blocage === 'impaye' ? `Recharge impayée : ${formatNombre(impaye, 2)} DT` : 'Solde insuffisant pour recharger'}</strong>
            <span>
              {blocage === 'impaye'
                ? 'Réglez votre recharge précédente pour pouvoir en lancer une nouvelle.'
                : `Il faut au moins ${formatNombre(soldeMinimumRecharge, 2)} DT dans votre wallet pour démarrer (solde : ${formatNombre(user?.soldeWallet ?? 0, 2)} DT). La recharge s’arrête ensuite d’elle-même quand votre solde est atteint.`}
            </span>
            {blocage === 'impaye'
              ? <Link to="/espace/paiements" className="fiche-solde-bouton">Régler maintenant</Link>
              : <button type="button" className="fiche-solde-bouton" onClick={() => setRecharge(true)}>Recharger mon wallet</button>}
          </div>
        )}
        {!publique && (
          <Link to={`/espace/volta?question=${encodeURIComponent(question)}`} className="fiche-volta">
            <IconeVolta /> <strong>Demander à Volta</strong><span>prix, conseils</span><RightOutlined />
          </Link>
        )}

        {publique ? (
          <div className="fiche-carte">
            <h3>Borne d’un autre opérateur</h3>
            <p>Elle n’est pas reliée au réseau Volteo : la recharge se lance sur place ou depuis l’application de {borne.operateur ?? 'l’opérateur'}. Données OpenStreetMap.</p>
          </div>
        ) : (
          <>
            <h2>Choisissez une prise</h2>
            <div className="fiche-prises">
              {borne.connecteurs.map((c) => {
                const ok = !horsService && c.etat === 'disponible'
                return (
                  <button key={c.id} type="button" disabled={!ok} className={`fiche-prise${prise?.id === c.id ? ' choisie' : ''}`} onClick={() => setPrise(prise?.id === c.id ? null : c)}>
                    <span className="fiche-prise-haut"><strong>{NOM_PRISE[c.type] ?? c.type}</strong>{prise?.id === c.id && <CheckCircleFilled />}</span>
                    <span className="fiche-prise-kw">{c.puissanceKw}<small> kW · {c.courant}</small></span>
                    <span className={`fiche-prise-etat${ok ? ' libre' : ''}`}>{ok ? 'Libre' : c.etat === 'occupe' ? 'Occupée' : 'Indisponible'}</span>
                  </button>
                )
              })}
            </div>

            <div className="fiche-carte">
              <h2>Planifier la charge</h2>
              <p>{vehicule ? `${vehicule.marque} ${vehicule.modele} · batterie ${vehicule.capaciteBatterieKwh} kWh` : 'Batterie de 60 kWh par défaut'}</p>
              <div className="fiche-curseur"><span>Batterie actuelle</span><b>{batterie} %</b></div>
              <Slider min={0} max={95} value={batterie} onChange={(v) => { setBatterie(v); if (v >= objectif) setObjectif(Math.min(100, v + 5)) }} tooltip={{ open: false }} />
              <div className="fiche-curseur"><span>Objectif</span><b>{objectif} %</b></div>
              <Slider min={10} max={100} value={objectif} onChange={(v) => setObjectif(Math.max(v, batterie + 5))} tooltip={{ open: false }} />
              {estimation ? (
                <>
                  <div className="fiche-estimations">
                    <div><span>Durée</span><strong>{formatDuree(estimation.minutes)}</strong></div>
                    <div><span>Énergie</span><strong>{formatNombre(estimation.energieKwh, 1)} kWh</strong></div>
                    <div><span>Prix estimé</span><strong className="cuivre">{formatNombre(estimation.prix, 2)} DT</strong></div>
                  </div>
                  <p>≈ {formatNombre(estimation.km, 0)} km d’autonomie ajoutés. Estimation : la puissance réelle dépend du véhicule et de la température.</p>
                </>
              ) : (
                <p>Choisissez une prise pour obtenir une estimation.</p>
              )}
            </div>
          </>
        )}

        <h2>Informations</h2>
        <div className="fiche-carte fiche-infos">
          {!publique && tarif && <Ligne libelle="Tarif" valeur={`${tarif.nom}${tarif.valideAu ? ` · jusqu’au ${dayjs(tarif.valideAu).format('DD/MM/YYYY')}` : ''}`} />}
          {!publique && tarif?.prixHeuresCreuses != null && tarif.heuresCreusesDebut && <Ligne libelle="Heures creuses" valeur={`${formatNombre(tarif.prixHeuresCreuses, 2)} DT · ${tarif.heuresCreusesDebut}–${tarif.heuresCreusesFin}`} />}
          {!publique && (tarif?.fraisSession ?? 0) > 0 && <Ligne libelle="Frais par recharge" valeur={`${formatNombre(tarif!.fraisSession, 2)} DT`} />}
          {!publique && <Ligne libelle="Dernier signal" valeur={formatRelatif(borne.dernierHeartbeat)} />}
          {!publique && borne.temperatureC != null && <Ligne libelle="Température" valeur={`${formatNombre(borne.temperatureC, 0)} °C`} />}
          {borne.fabricant && <Ligne libelle="Matériel" valeur={[borne.fabricant, borne.modele].filter(Boolean).join(' ')} />}
          {borne.versionOcpp && <Ligne libelle="Protocole" valeur={`OCPP ${borne.versionOcpp}`} />}
          <Ligne libelle="Coordonnées" valeur={`${formatNombre(borne.latitude, 4)}, ${formatNombre(borne.longitude, 4)}`} />
        </div>
      </div>

      <ModalePaiement ouvert={recharge} objet={{ objet: 'recharge_wallet' }} onFermer={() => setRecharge(false)} />
      <div className="fiche-pied">
        <button type="button" className="fiche-secondaire" onClick={() => navigate(`/espace/trajet?borne=${borne.id}`)}><AimOutlined /> Itinéraire</button>
        {!publique && (
          blocage === 'solde' ? (
            <button type="button" className="fiche-principal" onClick={() => setRecharge(true)}>Recharger mon wallet</button>
          ) : blocage === 'impaye' ? (
            <button type="button" className="fiche-principal" onClick={() => navigate('/espace/paiements')}>Régler {formatNombre(impaye, 2)} DT</button>
          ) : (
            <button type="button" className="fiche-principal" disabled={horsService || !prise || !!active || demarrage.isPending} onClick={() => demarrage.mutate()}>
              <ThunderboltFilled /> {active ? 'Recharge déjà en cours' : horsService ? 'Indisponible' : prise ? `Démarrer · ${NOM_PRISE[prise.type] ?? prise.type}` : 'Choisissez une prise'}
            </button>
          )
        )}
      </div>
    </div>
  )
}
