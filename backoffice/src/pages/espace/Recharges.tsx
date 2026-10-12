import { useState } from 'react'
import { Card, Drawer, Empty, Table, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import ReactECharts from '../../components/Graphique'
import { espace } from '../../api'
import { Statut } from '../../components/commun'
import { ETAT_SESSION_COLORS, ETAT_SESSION_LABELS, enFuseau, formatDate, formatDuree, formatEnergie, formatMontant } from '../../format'
import type { SessionClient } from '../../types'

export default function EspaceRecharges() {
  const [detail, setDetail] = useState<SessionClient | null>(null)
  const { data, isLoading } = useQuery({ queryKey: ['espace', 'sessions'], queryFn: espace.sessions })
  const { data: mesures } = useQuery({ queryKey: ['espace', 'mesures', detail?.id], queryFn: () => espace.mesures(detail!.id), enabled: !!detail })

  return (
    <div className="pile">
      <Typography.Title level={3} style={{ margin: 0 }}>Mes recharges</Typography.Title>
      <Card size="small">
        <Table rowKey="id" size="middle" loading={isLoading} dataSource={data} pagination={{ pageSize: 15, hideOnSinglePage: true }}
          onRow={(s) => ({ onClick: () => setDetail(s), className: 'ligne-cliquable' })}
          columns={[
            { title: 'Date', dataIndex: 'dateDebut', render: (d) => formatDate(d) },
            { title: 'Borne', dataIndex: 'borneNom' },
            { title: 'Prise', dataIndex: 'typeConnecteur', responsive: ['md'] },
            { title: 'Durée', dataIndex: 'dureeMinutes', responsive: ['md'], render: (m) => formatDuree(m) },
            { title: 'Énergie', dataIndex: 'energieKwh', render: (e) => formatEnergie(e) },
            { title: 'Montant', dataIndex: 'prix', render: (p) => formatMontant(p) },
            { title: 'État', dataIndex: 'etat', render: (e) => <Statut valeur={e} libelles={ETAT_SESSION_LABELS} couleurs={ETAT_SESSION_COLORS} /> },
          ]}
        />
      </Card>
      <Drawer open={!!detail} onClose={() => setDetail(null)} width={600} title={detail && `${detail.borneNom} — ${formatDate(detail.dateDebut)}`}>
        {mesures && mesures.length > 1 ? (
          <ReactECharts notMerge style={{ height: 320 }} option={{
            tooltip: { trigger: 'axis' },
            legend: { top: 0 },
            grid: { left: 40, right: 40, top: 36, bottom: 24 },
            xAxis: { type: 'category', data: mesures.map((m) => enFuseau(m.t).format('HH:mm')) },
            yAxis: [{ type: 'value', name: 'kW' }, { type: 'value', name: '%', max: 100, splitLine: { show: false } }],
            series: [
              { name: 'Puissance', type: 'line', smooth: 0.3, smoothMonotone: 'x', showSymbol: false, areaStyle: { opacity: 0.1 }, data: mesures.map((m) => m.puissanceKw), itemStyle: { color: '#E5545F' } },
              { name: 'Batterie', type: 'line', yAxisIndex: 1, smooth: 0.3, smoothMonotone: 'x', showSymbol: false, data: mesures.map((m) => m.pourcentageBatterie), itemStyle: { color: '#E5545F' } },
            ],
          }} />
        ) : (
          <Empty description="Courbe indisponible" />
        )}
      </Drawer>
    </div>
  )
}
