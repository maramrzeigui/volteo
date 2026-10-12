import { useState } from 'react'
import { Badge, Card, Col, Row, Select, Space, Typography } from 'antd'
import { BankOutlined, MessageOutlined, DashboardOutlined, ThunderboltOutlined, WalletOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { fetchMaStation } from '../api'
import { EnTete, Kpi } from '../components/commun'
import ReactECharts from '../components/Graphique'
import { formatMontant, formatNombre } from '../format'
import { ClientsStation, Messagerie, PuissanceBornes, RechargesEnDirect } from '../components/ActiviteStation'
import { C } from '../theme'
import { Releves } from './Stations'

const AXE = { axisLine: { lineStyle: { color: '#3A3A43' } }, axisLabel: { color: C.texteDoux } }

/**
 * Tableau de bord de l'administrateur d'une station : recharges en direct, chiffre
 * d'affaires, part nette après la commission de la plateforme, bornes et relevés.
 */
export default function MaStationPage() {
  const [annee, setAnnee] = useState(dayjs().year())
  const { data, isLoading } = useQuery({ queryKey: ['ma-station', annee], queryFn: () => fetchMaStation(annee), refetchInterval: 30000 })

  return (
    <div className="page">
      <EnTete
        surtitre="Ma station"
        titre={data?.station.nom ?? 'Ma station'}
        sousTitre={data ? `Formule ${data.station.formule} · commission Volteo ${data.station.commissionPct} %${data.station.finContrat ? ` · contrat jusqu’au ${dayjs(data.station.finContrat).format('DD/MM/YYYY')}` : ''}` : undefined}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}>
          <Kpi titre="Aujourd’hui" valeur={formatMontant(data?.aujourdhui.chiffreAffaires ?? 0)} icone={<ThunderboltOutlined />} chargement={isLoading}
            pied={`${data?.aujourdhui.sessions ?? 0} recharge(s) · ${formatNombre(data?.aujourdhui.energieKwh ?? 0, 1)} kWh`} />
        </Col>
        <Col xs={12} lg={6}>
          <Kpi titre="Chiffre d’affaires du mois" valeur={formatMontant(data?.mois.chiffreAffaires ?? 0)} icone={<BankOutlined />} chargement={isLoading}
            tendance={data?.serie.map((j) => j.chiffreAffaires)} pied={`${data?.mois.sessions ?? 0} recharges`} />
        </Col>
        <Col xs={12} lg={6}>
          <Kpi titre="Votre part nette du mois" valeur={formatMontant(data?.mois.net ?? 0)} icone={<WalletOutlined />} couleur={C.cuivre} chargement={isLoading}
            pied={`Après ${formatMontant(data?.mois.commission ?? 0)} de commission`} />
        </Col>
        <Col xs={12} lg={6}>
          <Kpi titre="En direct" valeur={`${data?.enDirect.sessionsEnCours ?? 0}`} suffixe="recharge(s)" icone={<DashboardOutlined />} chargement={isLoading}
            pied={`${formatNombre(data?.enDirect.puissanceKw ?? 0, 1)} kW · occupation ${data?.enDirect.occupationPct ?? 0} %`} />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Card title="Chiffre d’affaires des 30 derniers jours">
            <ReactECharts
              notMerge
              style={{ height: 300 }}
              option={{
                tooltip: { trigger: 'axis' },
                legend: { top: 0, left: 0, textStyle: { color: C.texteDoux } },
                grid: { left: 52, right: 48, top: 56, bottom: 28 },
                xAxis: { type: 'category', data: data?.serie.map((j) => dayjs(j.jour).format('DD/MM')), ...AXE },
                yAxis: [
                  { type: 'value', name: 'DT', splitLine: { lineStyle: { color: '#26262D' } }, ...AXE },
                  { type: 'value', name: 'kWh', splitLine: { show: false }, ...AXE },
                ],
                series: [
                  { name: 'Chiffre d’affaires', type: 'bar', data: data?.serie.map((j) => j.chiffreAffaires), itemStyle: { color: C.rougeVif, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 16 },
                  { name: 'Énergie', type: 'line', yAxisIndex: 1, smooth: 0.3, data: data?.serie.map((j) => j.energieKwh), itemStyle: { color: C.cuivre }, areaStyle: { opacity: 0.08 } },
                ],
              }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={`Puissance de mes bornes (${data?.bornes.length ?? 0})`} styles={{ body: { maxHeight: 344, overflow: 'auto' } }}>
            <PuissanceBornes bornes={data?.bornes ?? []} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title={<Space><span className="point-direct" />Recharges en cours</Space>}>
            <RechargesEnDirect recharges={data?.recharges ?? []} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<Space><MessageOutlined />Échanges avec Volteo{!!data?.messagesNonLus && <Badge count={data.messagesNonLus} />}</Space>}>
            <Messagerie />
          </Card>
        </Col>
      </Row>

      <Card title="Mes clients ce mois-ci" style={{ marginBottom: 16 }}>
        <ClientsStation clients={data?.clients ?? []} />
      </Card>

      <Card
        title="Relevés mensuels et reversements"
        extra={<Select value={annee} onChange={setAnnee} style={{ width: 110 }} options={[0, 1, 2].map((d) => ({ value: dayjs().year() - d, label: String(dayjs().year() - d) }))} />}
      >
        <Typography.Paragraph type="secondary">
          Volteo encaisse les recharges et vous reverse chaque mois le chiffre d’affaires moins sa commission.
        </Typography.Paragraph>
        <Releves releves={data?.releves ?? []} />
      </Card>
    </div>
  )
}
