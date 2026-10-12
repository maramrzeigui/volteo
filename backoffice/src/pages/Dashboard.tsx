import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, Col, Empty, List, Progress, Row, Segmented, Space, Tag, Typography } from 'antd'
import {
  AlertOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FieldTimeOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import ReactECharts from '../components/Graphique'
import { fetchAlertes, fetchSeries, fetchStats, fetchSupervision, fetchTopBornes } from '../api'
import { useAuth } from '../auth'
import CarteBornes from '../components/CarteBornes'
import { EnTete, Kpi, Statut } from '../components/commun'
import { Anneau, Sparkline } from '../components/Premium'
import { ChiffreAnime } from '../motion'
import dayjs from 'dayjs'
import {
  ETAT_BORNE_COLORS,
  ETAT_BORNE_LABELS,
  GRAVITE_COLORS,
  GRAVITE_LABELS,
  enFuseau,
  formatDuree,
  formatEnergie,
  formatMontant,
  formatNombre,
  formatRelatif,
  getDevise,
} from '../format'
import type { EtatBorne, Stats } from '../types'

const AXE = { axisLine: { lineStyle: { color: '#2E2E36' } }, axisLabel: { color: '#A1A1AA' }, axisTick: { show: false } }

/** Bandeau « réseau en direct » : puissance délivrée, disponibilité, chiffre d'affaires du mois. */
function BandeauDirect({ stats, energieJours }: { stats?: Stats; energieJours: number[] }) {
  return (
    <section className="bandeau-encre" aria-label="Réseau en direct">
      <div className="bandeau-colonne bandeau-principal">
        <span className="bandeau-surtitre">
          <span className="bandeau-point" /> Réseau en direct
        </span>
        <div className="bandeau-valeur">
          <ChiffreAnime valeur={formatNombre(stats?.puissanceInstantaneeKw, 1)} />
          <span className="bandeau-unite">kW</span>
        </div>
        <span className="bandeau-legende">
          délivrés en ce moment · {stats?.sessionsEnCours ?? 0} recharge(s) en cours
        </span>
      </div>

      <div className="bandeau-colonne bandeau-disponibilite">
        <Anneau pourcentage={stats?.tauxDisponibilite ?? 0} taille={132} epaisseur={10}>
          <strong>
            <ChiffreAnime valeur={stats?.tauxDisponibilite ?? 0} />
            <small>%</small>
          </strong>
          <span>disponible</span>
        </Anneau>
        <div className="bandeau-details">
          <strong>
            {stats?.bornesActives ?? 0}/{stats?.bornesTotal ?? 0} bornes en service
          </strong>
          <span>{stats?.bornesOccupees ?? 0} occupée(s)</span>
          <span>{stats?.bornesIndisponibles ?? 0} indisponible(s)</span>
        </div>
      </div>

      <div className="bandeau-colonne">
        <span className="bandeau-surtitre">Chiffre d'affaires du mois</span>
        <div className="bandeau-valeur bandeau-cuivre">
          <ChiffreAnime valeur={formatMontant(stats?.caMois)} />
        </div>
        <span className="bandeau-legende">Aujourd'hui : {formatMontant(stats?.caAujourdhui)}</span>
      </div>

      {energieJours.length > 1 && (
        <div className="bandeau-courbe">
          <Sparkline valeurs={energieJours} couleur="#E5545F" hauteur={90} epaisseur={2.5} />
        </div>
      )}
    </section>
  )
}

/** Module 15 — tableau de bord : KPIs, carte temps réel, tendances. */
export default function DashboardPage() {
  const { peut } = useAuth()
  const navigate = useNavigate()
  const [jours, setJours] = useState(14)

  const { data: stats, isLoading } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 30_000 })
  const { data: series } = useQuery({ queryKey: ['stats', 'series', jours], queryFn: () => fetchSeries(jours) })
  const { data: top } = useQuery({ queryKey: ['stats', 'top'], queryFn: fetchTopBornes })
  const { data: supervision } = useQuery({
    queryKey: ['supervision'],
    queryFn: fetchSupervision,
    enabled: peut('supervision'),
    refetchInterval: 30_000,
  })
  const { data: alertes } = useQuery({
    queryKey: ['alertes', 'ouvertes'],
    queryFn: () => fetchAlertes({ resolue: 0 }),
    enabled: peut('alertes'),
  })

  const etiquettes = (series?.jours ?? []).map((j) => enFuseau(j.jour).format('DD MMM'))
  const repartition = (supervision?.bornes ?? []).reduce<Record<string, number>>((acc, b) => {
    acc[b.etat] = (acc[b.etat] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="pile">
      <EnTete
        surtitre="Supervision du réseau · Tunisie"
        titre="Tableau de bord"
        sousTitre={`${dayjs().format('dddd D MMMM YYYY')} · vue d'ensemble du réseau`}
      />

      <BandeauDirect stats={stats} energieJours={(series?.jours ?? []).map((j) => j.kwh)} />

      <Row gutter={[16, 16]}>
        <Col xs={12} xl={6}>
          <Kpi titre="Sessions aujourd'hui" valeur={stats?.sessionsAujourdhui ?? '—'} couleur="#E5545F" chargement={isLoading}
            icone={<FieldTimeOutlined />} tendance={series?.jours.map((j) => j.sessions)}
            pied={`${stats?.sessionsEnCours ?? 0} en cours · ${formatNombre(stats?.puissanceInstantaneeKw, 1)} kW`} />
        </Col>
        <Col xs={12} xl={6}>
          <Kpi titre="kWh délivrés" valeur={formatNombre(stats?.kwhTotal, 0)} suffixe="kWh" couleur="#E5545F" chargement={isLoading}
            icone={<ThunderboltOutlined />} tendance={series?.jours.map((j) => j.kwh)}
            pied={`Aujourd'hui : ${formatEnergie(stats?.kwhAujourdhui)}`} />
        </Col>
        <Col xs={12} xl={6}>
          <Kpi titre="CA aujourd'hui" valeur={formatMontant(stats?.caAujourdhui)} couleur="#F4CDC6" chargement={isLoading}
            icone={<DollarOutlined />} tendance={series?.jours.map((j) => j.ca)} pied={`Mois : ${formatMontant(stats?.caMois)}`} />
        </Col>
        <Col xs={12} xl={6}>
          <Kpi titre="Temps moyen de recharge" valeur={formatDuree(stats?.tempsMoyenMinutes)} couleur="#A78BFA" chargement={isLoading}
            icone={<ClockCircleOutlined />} pied={
              <span>
                <AlertOutlined /> {stats?.alertesOuvertes ?? 0} alerte(s) · <ToolOutlined /> {stats?.maintenancesEnCours ?? 0} OT
              </span>
            } />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {peut('supervision') && (
          <Col xs={24} xl={16}>
            <Card
              title="Carte temps réel"
              size="small"
              extra={<Link to="/carte">Carte GIS complète</Link>}
            >
              {supervision && supervision.bornes.length > 0 ? (
                <CarteBornes
                  points={supervision.bornes}
                  hauteur={380}
                  popup={(b) => (
                    <div style={{ minWidth: 180 }}>
                      <strong>{b.nom}</strong>
                      <br />
                      <Tag color={ETAT_BORNE_COLORS[b.etat]} style={{ marginTop: 4 }}>{ETAT_BORNE_LABELS[b.etat]}</Tag>
                      <div style={{ marginTop: 4 }}>
                        Occupation : {b.connecteursOccupes}/{b.connecteursTotal}
                        <br />
                        Heartbeat : {formatRelatif(b.dernierHeartbeat)}
                      </div>
                      <a onClick={() => navigate(`/bornes/${b.id}`)}>Voir la fiche</a>
                    </div>
                  )}
                />
              ) : (
                <Empty description="Aucune borne" />
              )}
              <Space wrap style={{ marginTop: 12 }}>
                {(Object.keys(ETAT_BORNE_LABELS) as EtatBorne[]).map((etat) => (
                  <Tag key={etat} color={ETAT_BORNE_COLORS[etat]}>
                    {ETAT_BORNE_LABELS[etat]} · {repartition[etat] ?? 0}
                  </Tag>
                ))}
              </Space>
            </Card>
          </Col>
        )}
        <Col xs={24} xl={peut('supervision') ? 8 : 24}>
          <div className="pile" style={{ height: '100%' }}>
            {peut('alertes') && (
              <Card title="Alertes ouvertes" size="small" extra={<Link to="/alertes">Toutes</Link>}>
                <List
                  size="small"
                  dataSource={(alertes ?? []).slice(0, 5)}
                  locale={{ emptyText: 'Aucune alerte ouverte' }}
                  renderItem={(a) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Space size={6}><Statut valeur={a.gravite} libelles={GRAVITE_LABELS} couleurs={GRAVITE_COLORS} />{a.borneNom}</Space>}
                        description={<>{a.message}<br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatRelatif(a.createdAt)}</Typography.Text></>}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            )}
            <Card title="Top bornes (30 jours)" size="small">
              <List
                size="small"
                dataSource={top ?? []}
                locale={{ emptyText: 'Pas encore de données' }}
                renderItem={(b, i) => {
                  const max = top?.[0]?.kwh || 1
                  return (
                    <List.Item>
                      <div style={{ width: '100%' }}>
                        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                          <Typography.Text strong>{i + 1}. {b.borneNom}</Typography.Text>
                          <Typography.Text type="secondary">{formatEnergie(b.kwh)}</Typography.Text>
                        </Space>
                        <Progress percent={Math.round((b.kwh / max) * 100)} showInfo={false} size="small" strokeColor="#E5545F" />
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {b.sessions} sessions · {formatMontant(b.ca)}
                        </Typography.Text>
                      </div>
                    </List.Item>
                  )
                }}
              />
            </Card>
          </div>
        </Col>
      </Row>

      <Card
        size="small"
        title="Activité"
        extra={
          <Segmented
            size="small"
            value={jours}
            onChange={(v) => setJours(Number(v))}
            options={[
              { label: '7 j', value: 7 },
              { label: '14 j', value: 14 },
              { label: '30 j', value: 30 },
              { label: '90 j', value: 90 },
            ]}
          />
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <ReactECharts
              notMerge
              style={{ height: 300 }}
              option={{
                title: { text: 'Sessions et énergie', textStyle: { fontSize: 13, fontWeight: 500 } },
                tooltip: { trigger: 'axis' },
                legend: { top: 0, right: 0 },
                grid: { left: 44, right: 48, top: 64, bottom: 28 },
                xAxis: { type: 'category', data: etiquettes, ...AXE },
                yAxis: [
                  { type: 'value', name: 'Sessions', splitLine: { lineStyle: { color: '#26262D' } }, ...AXE },
                  { type: 'value', name: 'kWh', splitLine: { show: false }, ...AXE },
                ],
                series: [
                  { name: 'Sessions', type: 'bar', data: series?.jours.map((j) => j.sessions), itemStyle: { color: '#E5545F', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 18 },
                  { name: 'Énergie (kWh)', type: 'line', yAxisIndex: 1, smooth: 0.3, smoothMonotone: 'x', data: series?.jours.map((j) => j.kwh), itemStyle: { color: '#E5545F' }, areaStyle: { opacity: 0.08 } },
                ],
              }}
            />
          </Col>
          <Col xs={24} lg={12}>
            <ReactECharts
              notMerge
              style={{ height: 300 }}
              option={{
                title: { text: `Chiffre d'affaires (${getDevise()})`, textStyle: { fontSize: 13, fontWeight: 500 } },
                tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatMontant(v) },
                grid: { left: 52, right: 16, top: 40, bottom: 28 },
                xAxis: { type: 'category', data: etiquettes, ...AXE },
                yAxis: { type: 'value', splitLine: { lineStyle: { color: '#26262D' } }, ...AXE },
                series: [
                  { type: 'line', smooth: 0.3, smoothMonotone: 'x', data: series?.jours.map((j) => j.ca), itemStyle: { color: '#F4CDC6' }, areaStyle: { color: 'rgba(191,97,40,.12)' } },
                ],
              }}
            />
          </Col>
          <Col xs={24} lg={14}>
            <ReactECharts
              notMerge
              style={{ height: 260 }}
              option={{
                title: { text: 'Profil horaire des recharges', textStyle: { fontSize: 13, fontWeight: 500 } },
                tooltip: { trigger: 'axis' },
                grid: { left: 36, right: 16, top: 40, bottom: 28 },
                xAxis: { type: 'category', data: series?.parHeure.map((h) => `${h.heure}h`), ...AXE },
                yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#26262D' } }, ...AXE },
                series: [{ type: 'bar', data: series?.parHeure.map((h) => h.sessions), itemStyle: { color: '#A78BFA', borderRadius: [3, 3, 0, 0] } }],
              }}
            />
          </Col>
          <Col xs={24} lg={10}>
            <ReactECharts
              notMerge
              style={{ height: 260 }}
              option={{
                title: { text: 'Sessions par type de connecteur', textStyle: { fontSize: 13, fontWeight: 500 } },
                tooltip: { trigger: 'item' },
                legend: { bottom: 0, left: 'center', top: 'auto', right: 'auto' },
                color: ['#E5545F', '#E5545F', '#F4CDC6', '#A78BFA', '#FF6B6B'],
                series: [
                  {
                    type: 'pie',
                    radius: ['45%', '70%'],
                    center: ['50%', '52%'],
                    label: { formatter: '{b}\n{d}%', color: '#A1A1AA' },
                    avoidLabelOverlap: true,
                    data: series?.parConnecteur.map((c) => ({ name: c.type, value: c.sessions })),
                  },
                ],
              }}
            />
          </Col>
        </Row>
      </Card>
    </div>
  )
}
