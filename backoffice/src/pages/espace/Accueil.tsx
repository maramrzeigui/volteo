import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, Col, Empty, Row, Space, Statistic, Tag, Typography } from 'antd'
import { CarOutlined, DollarOutlined, EnvironmentOutlined, FieldTimeOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import ReactECharts from '../../components/Graphique'
import { espace } from '../../api'
import { useAuth } from '../../auth'
import { formatDuree, formatEnergie, formatMontant, formatNombre } from '../../format'
import { BoutonRecharge } from './commun'
import BornesDisponibles from './BornesDisponibles'
import TrajetVoltaCarte from '../../components/TrajetVoltaCarte'
import { VoitureRecharge } from '../../components/VoitureRecharge'
import { Kpi } from '../../components/commun'
import { Anneau } from '../../components/Premium'
import { ChiffreAnime } from '../../motion'
import { useSoldeEnDirect } from '../../hooks/useSoldeEnDirect'

export default function EspaceAccueil() {
  const { user } = useAuth()
  const { solde, enCours } = useSoldeEnDirect()
  const navigate = useNavigate()
  const { data: active } = useQuery({ queryKey: ['espace', 'active'], queryFn: espace.sessionActive, refetchInterval: 10_000 })
  const { data: stats } = useQuery({ queryKey: ['espace', 'stats'], queryFn: espace.statistiques })
  const { data: souscription } = useQuery({ queryKey: ['espace', 'souscription'], queryFn: espace.souscription })


  const { data: vehicules } = useQuery({ queryKey: ['espace', 'vehicules'], queryFn: espace.vehicules })
  const { data: sessions } = useQuery({ queryKey: ['espace', 'sessions'], queryFn: espace.sessions })
  const vehicule = vehicules?.[0]
  // Batterie : celle de la recharge en cours, sinon le niveau relevé à la fin de la dernière recharge.
  const batterie = active?.pourcentageBatterie ?? sessions?.find((x) => x.etat === 'terminee' && x.pourcentageBatterie != null)?.pourcentageBatterie ?? null
  const autonomie = batterie != null && vehicule ? Math.round(((batterie / 100) * vehicule.capaciteBatterieKwh / 17) * 100) : null

  const duree = active ? dayjs().diff(dayjs(active.dateDebut), 'minute') : 0

  return (
    <div className="pile">
      <section className="bandeau-encre bandeau-client" aria-label="Mon wallet">
        <div className="bandeau-colonne bandeau-principal">
          <span className="bandeau-surtitre">Bonjour {user?.prenom}</span>
          <span className="bandeau-legende">Solde de mon wallet</span>
          <div className="bandeau-valeur">
            <ChiffreAnime valeur={formatMontant(solde)} />
            {enCours > 0 && <span className="solde-encours">Recharge en cours : −{formatMontant(enCours)}</span>}
          </div>
          <Space wrap style={{ marginTop: 10 }}>
            <BoutonRecharge />
            <Link to="/espace/paiements"><Button className="bouton-sur-encre">Mes paiements</Button></Link>
          </Space>
        </div>
        <div className="bandeau-colonne">
          <span className="bandeau-surtitre">Mon abonnement</span>
          {souscription ? (
            <>
              <div className="bandeau-abonnement">
                {souscription.abonnementNom} <Tag color="success" style={{ marginInlineStart: 6 }}>Actif</Tag>
              </div>
              <span className="bandeau-legende">
                {souscription.remisePourcent} % de remise · {souscription.kwhInclus} kWh inclus / mois
                <br />
                Jusqu'au {dayjs(souscription.dateFin).format('DD/MM/YYYY')}
              </span>
              <Link to="/espace/abonnement" className="lien-sur-encre">Gérer mon abonnement →</Link>
            </>
          ) : (
            <>
              <span className="bandeau-legende">Économisez sur chaque recharge avec une formule mensuelle.</span>
              <Link to="/espace/abonnement" className="lien-sur-encre">Découvrir les formules →</Link>
            </>
          )}
        </div>
      </section>

      {/* Mon véhicule, garé à la borne (même scène que l'application mobile). */}
      <Card className="carte-vehicule-carte">
        <div className="carte-vehicule">
          <div className="carte-vehicule-tete">
            <Typography.Text type="secondary" style={{ letterSpacing: '.1em', fontSize: 12, fontWeight: 700 }}>MON VÉHICULE</Typography.Text>
            {vehicule && <span className="plaque">{vehicule.immatriculation}</span>}
          </div>
          <Typography.Title level={3} style={{ margin: 0 }}>{vehicule ? `${vehicule.marque} ${vehicule.modele}` : 'Ajoutez votre véhicule'}</Typography.Title>
          <VoitureRecharge batterie={batterie ?? 60} enCharge={!!active || batterie != null} />
          {batterie != null ? (
            <>
              <div className="carte-vehicule-tete">
                <span style={{ fontSize: 40, fontWeight: 800, fontFamily: 'var(--police-titre)' }}>{batterie}<small style={{ fontSize: 20, color: 'var(--texte-doux)' }}> %</small></span>
                {autonomie != null && <Typography.Text style={{ fontSize: 18 }}>≈ {autonomie} km</Typography.Text>}
              </div>
              <div className="barre-batterie"><span style={{ width: `${batterie}%` }} /></div>
              <Typography.Text type="secondary">{active ? 'Recharge en cours.' : 'Niveau relevé à la fin de votre dernière recharge.'}</Typography.Text>
            </>
          ) : (
            <Typography.Text type="secondary">Le niveau de batterie s’affichera après votre première recharge.</Typography.Text>
          )}
          <Link to="/espace/carte"><Button type="primary" size="large" block style={{ marginTop: 8 }}>Trouver une borne</Button></Link>
        </div>
      </Card>

      {/* Trajet Volta : même point d'entrée que dans l'application mobile. */}
      <TrajetVoltaCarte />

      <BornesDisponibles />

      <Card title={<Space><ThunderboltOutlined />Recharge en cours</Space>}>
        {active ? (
          <Row gutter={[24, 16]} align="middle">
            <Col xs={24} md={8} style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-block' }}>
                <Anneau pourcentage={active.pourcentageBatterie ?? 0} taille={150} epaisseur={12} couleur="#E5545F" piste="#2A2A31">
                  <strong className="anneau-clair">{active.pourcentageBatterie ?? 0}<small>%</small></strong>
                  <span className="anneau-clair-legende">batterie</span>
                </Anneau>
              </div>
            </Col>
            <Col xs={24} md={16}>
              <Typography.Title level={4} style={{ marginTop: 0 }}>{active.borneNom} <Tag>{active.typeConnecteur}</Tag>{active.etat === 'en_pause' && <Tag color="warning">En pause</Tag>}</Typography.Title>
              <Row gutter={16}>
                <Col xs={12} sm={6}><Statistic title="Énergie" value={formatEnergie(active.energieKwh)} /></Col>
                <Col xs={12} sm={6}><Statistic title="Puissance" value={`${formatNombre(active.puissanceInstantaneeKw, 1)} kW`} /></Col>
                <Col xs={12} sm={6}><Statistic title="Durée" value={formatDuree(duree)} /></Col>
                <Col xs={12} sm={6}><Statistic title="Coût actuel" value={formatMontant(active.prix)} /></Col>
              </Row>
              <Button type="primary" icon={<ThunderboltOutlined />} style={{ marginTop: 16 }} onClick={() => navigate('/espace/recharge')}>
                Suivre la recharge
              </Button>
            </Col>
          </Row>
        ) : (
          <Empty description="Aucune recharge en cours">
            <Link to="/espace/carte"><Button type="primary" icon={<EnvironmentOutlined />}>Trouver une borne</Button></Link>
          </Empty>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Kpi titre="Recharges" valeur={stats?.sessionsTotal ?? 0} icone={<FieldTimeOutlined />} couleur="#E5545F" tendance={stats?.parMois.map((m) => m.sessions)} />
        </Col>
        <Col xs={12} md={6}>
          <Kpi titre="Énergie" valeur={formatEnergie(stats?.energieTotaleKwh)} icone={<ThunderboltOutlined />} couleur="#E5545F" tendance={stats?.parMois.map((m) => m.kwh)} />
        </Col>
        <Col xs={12} md={6}>
          <Kpi titre="Dépenses" valeur={formatMontant(stats?.depensesTotal)} icone={<DollarOutlined />} couleur="#F4CDC6" tendance={stats?.parMois.map((m) => m.prix)} />
        </Col>
        <Col xs={12} md={6}>
          <Kpi titre="Autonomie ajoutée" valeur={formatNombre(stats?.kmAjoutes)} suffixe="km" icone={<CarOutlined />} couleur="#8E8E99" />
        </Col>
      </Row>
      <Card title="Ma consommation (6 mois)" size="small">
        <ReactECharts
          notMerge
          style={{ height: 260 }}
          option={{
            tooltip: { trigger: 'axis' },
            legend: { top: 0 },
            grid: { left: 44, right: 44, top: 36, bottom: 24 },
            xAxis: { type: 'category', data: stats?.parMois.map((m) => dayjs(`${m.mois}-01`).format('MMM YY')) },
            yAxis: [{ type: 'value', name: 'kWh' }, { type: 'value', name: 'DT', splitLine: { show: false } }],
            series: [
              { name: 'Énergie (kWh)', type: 'bar', data: stats?.parMois.map((m) => m.kwh), itemStyle: { color: '#E5545F', borderRadius: [4, 4, 0, 0] } },
              { name: 'Dépenses', type: 'line', yAxisIndex: 1, smooth: 0.3, smoothMonotone: 'x', data: stats?.parMois.map((m) => m.prix), itemStyle: { color: '#F4CDC6' } },
            ],
          }}
        />
      </Card>
    </div>
  )
}
