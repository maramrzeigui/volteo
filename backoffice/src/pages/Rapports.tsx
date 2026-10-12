import { useMemo, useState } from 'react'
import { Card, Col, DatePicker, Empty, Row, Segmented, Select, Statistic, Table } from 'antd'
import { useQuery } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import ReactECharts from '../components/Graphique'
import { exporterRapport, fetchBornes, fetchRapport } from '../api'
import { EnTete, ExportMenu } from '../components/commun'
import { TYPE_RAPPORT_LABELS, formatMontant, formatNombre } from '../format'
import type { Rapport, TypeRapport } from '../types'

const MONETAIRES = ['ht', 'tva', 'ttc', 'ca', 'depenses', 'coutPieces']

/** Graphique adapté à chaque rapport. */
function option(r: Rapport) {
  const l = r.lignes
  const base = { tooltip: { trigger: 'axis' }, grid: { left: 56, right: 24, top: 36, bottom: 60 }, legend: { top: 0 } }
  const axeX = (cle: string) => ({ type: 'category', data: l.map((x) => x[cle]), axisLabel: { rotate: l.length > 12 ? 45 : 0, color: '#A1A1AA' } })
  switch (r.type) {
    case 'consommation':
      return { ...base, xAxis: axeX('jour'), yAxis: [{ type: 'value', name: 'kWh' }, { type: 'value', name: 'Sessions' }],
        series: [{ name: 'Énergie (kWh)', type: 'bar', data: l.map((x) => x.kwh), itemStyle: { color: '#E5545F' } }, { name: 'Sessions', type: 'line', yAxisIndex: 1, data: l.map((x) => x.sessions), itemStyle: { color: '#F4CDC6' } }] }
    case 'chiffre_affaires':
      return { ...base, xAxis: axeX('jour'), yAxis: { type: 'value' },
        series: [{ name: 'HT', type: 'bar', stack: 'ca', data: l.map((x) => x.ht), itemStyle: { color: '#E5545F' } }, { name: 'TVA', type: 'bar', stack: 'ca', data: l.map((x) => x.tva), itemStyle: { color: '#7A2633' } }] }
    case 'utilisation':
      return { ...base, xAxis: axeX('borne'), yAxis: { type: 'value', name: '%', max: 100 }, series: [{ name: "Taux d'occupation (%)", type: 'bar', data: l.map((x) => x.tauxOccupation), itemStyle: { color: '#A78BFA' } }] }
    case 'disponibilite':
      return { ...base, xAxis: axeX('borne'), yAxis: { type: 'value', name: '%', min: (v: { min: number }) => Math.max(0, Math.floor(v.min - 5)), max: 100 },
        series: [{ name: 'Disponibilité (%)', type: 'bar', data: l.map((x) => ({ value: x.disponibilite, itemStyle: { color: Number(x.disponibilite) >= 99 ? '#F2A3AA' : Number(x.disponibilite) >= 95 ? '#F4CDC6' : '#FF6B6B' } })) }] }
    case 'top_bornes':
      return { ...base, xAxis: axeX('borne'), yAxis: { type: 'value', name: 'kWh' }, series: [{ name: 'Énergie (kWh)', type: 'bar', data: l.map((x) => x.kwh), itemStyle: { color: '#2DD4BF' } }] }
    case 'top_clients':
      return { ...base, xAxis: axeX('client'), yAxis: { type: 'value' }, series: [{ name: 'Dépenses', type: 'bar', data: l.map((x) => x.depenses), itemStyle: { color: '#F4CDC6' } }] }
    case 'maintenance': {
      const parStatut = l.reduce<Record<string, number>>((acc, x) => ({ ...acc, [String(x.statut)]: (acc[String(x.statut)] ?? 0) + 1 }), {})
      return { tooltip: { trigger: 'item' }, legend: { bottom: 0 }, series: [{ type: 'pie', radius: ['40%', '70%'], data: Object.entries(parStatut).map(([name, value]) => ({ name, value })) }] }
    }
  }
}

const LIBELLES_TOTAUX: Record<string, string> = {
  sessions: 'Sessions', kwh: 'Énergie (kWh)', ht: 'CA HT', tva: 'TVA', ttc: 'CA TTC', heures: 'Heures de charge', tauxMoyen: "Taux d'occupation moyen (%)",
  incidents: 'Incidents', disponibiliteMoyenne: 'Disponibilité moyenne (%)', ca: 'CA TTC', depenses: 'Dépenses', ordres: 'Ordres de travail',
  terminees: 'Terminés', correctives: 'Correctifs', coutPieces: 'Coût des pièces',
}

/** Module 14 — rapports : consommation, CA, utilisation, disponibilité, top bornes / clients, maintenance. */
export default function RapportsPage() {
  const [type, setType] = useState<TypeRapport>('consommation')
  const [periode, setPeriode] = useState<[Dayjs, Dayjs]>([dayjs().subtract(29, 'day'), dayjs()])
  const [borneId, setBorneId] = useState<number>()

  const params = { debut: periode[0].format('YYYY-MM-DD'), fin: periode[1].format('YYYY-MM-DD'), borne_id: borneId }
  const { data: rapport, isLoading } = useQuery({ queryKey: ['rapport', type, params], queryFn: () => fetchRapport(type, params) })
  const { data: bornes } = useQuery({ queryKey: ['bornes', {}], queryFn: () => fetchBornes() })

  const colonnes = useMemo(
    () =>
      Object.entries(rapport?.colonnes ?? {}).map(([cle, titre]) => ({
        title: titre,
        dataIndex: cle,
        sorter: (a: Record<string, string | number>, b: Record<string, string | number>) =>
          typeof a[cle] === 'number' ? (a[cle] as number) - (b[cle] as number) : String(a[cle]).localeCompare(String(b[cle])),
        render: (v: string | number) => (MONETAIRES.includes(cle) ? formatMontant(Number(v)) : typeof v === 'number' ? formatNombre(v, 2) : v),
      })),
    [rapport],
  )

  return (
    <div className="pile">
      <EnTete titre="Rapports" actions={<ExportMenu disabled={!rapport} onExport={(format) => exporterRapport(type, format, params)} />} />
      <Card size="small">
        <div className="rapports-filtres">
          <div className="rapports-types"><Segmented value={type} onChange={(v) => setType(v as TypeRapport)} options={(Object.keys(TYPE_RAPPORT_LABELS) as TypeRapport[]).map((t) => ({ value: t, label: TYPE_RAPPORT_LABELS[t] }))} /></div>
          <DatePicker.RangePicker
            format="DD/MM/YYYY"
            allowClear={false}
            value={periode}
            onChange={(v) => v?.[0] && v[1] && setPeriode([v[0], v[1]])}
            presets={[
              { label: '7 derniers jours', value: [dayjs().subtract(6, 'day'), dayjs()] },
              { label: '30 derniers jours', value: [dayjs().subtract(29, 'day'), dayjs()] },
              { label: 'Ce mois', value: [dayjs().startOf('month'), dayjs()] },
              { label: 'Mois dernier', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
              { label: 'Cette année', value: [dayjs().startOf('year'), dayjs()] },
            ]}
          />
          {!['top_clients'].includes(type) && (
            <Select allowClear placeholder="Toutes les bornes" style={{ width: 220, maxWidth: '100%' }} value={borneId} onChange={setBorneId} options={(bornes ?? []).map((b) => ({ value: b.id, label: b.nom }))} />
          )}
        </div>
      </Card>
      {rapport && (
        <Row gutter={[16, 16]}>
          {Object.entries(rapport.totaux).map(([cle, valeur]) => (
            <Col xs={12} md={6} key={cle}>
              <Card size="small"><Statistic title={LIBELLES_TOTAUX[cle] ?? cle} value={MONETAIRES.includes(cle) ? formatMontant(valeur) : formatNombre(valeur, 2)} /></Card>
            </Col>
          ))}
        </Row>
      )}
      <Card size="small" title={rapport?.titre} loading={isLoading}>
        {rapport && rapport.lignes.length > 0 ? (
          <>
            <ReactECharts notMerge style={{ height: 340 }} option={option(rapport)} />
            <Table rowKey="__cle" size="small" columns={colonnes} dataSource={rapport.lignes.map((l, i) => ({ ...l, __cle: i }))} pagination={{ pageSize: 15, hideOnSinglePage: true }} scroll={{ x: 800 }} style={{ marginTop: 16 }} />
          </>
        ) : (
          <Empty description="Aucune donnée sur la période" />
        )}
      </Card>
    </div>
  )
}
