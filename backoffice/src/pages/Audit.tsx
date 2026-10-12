import { useState } from 'react'
import { Card, DatePicker, Input, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQuery } from '@tanstack/react-query'
import type { Dayjs } from 'dayjs'
import { exporterAudit, fetchAudit, fetchUserOptions } from '../api'
import { EnTete, ExportMenu } from '../components/commun'
import { formatDate, libelleAction } from '../format'
import type { AuditEntry } from '../types'

const COULEURS: Record<string, string> = {
  connexion: 'success', connexion_2fa: 'success', connexion_echouee: 'error', deconnexion: 'default',
  creation: 'processing', modification: 'warning', suppression: 'error', desactivation: 'error', export: 'default', commande_ocpp: 'processing', remboursement: 'error',
}

/** Détail d'une modification au format {champ: [avant, après]}, sinon null (texte libre). */
function lireDiff(texte: string): Record<string, [unknown, unknown]> | null {
  try {
    const diff = JSON.parse(texte) as unknown
    if (diff && typeof diff === 'object' && !Array.isArray(diff) && Object.values(diff).every((v) => Array.isArray(v) && v.length === 2)) {
      return diff as Record<string, [unknown, unknown]>
    }
  } catch {
    // texte libre
  }
  return null
}

function Details({ texte }: { texte: string | null }) {
  if (!texte) return <Typography.Text type="secondary">—</Typography.Text>
  const diff = lireDiff(texte)
  if (!diff) return <span style={{ fontSize: 12, wordBreak: 'break-word' }}>{texte}</span>
  return (
    <div style={{ fontSize: 12 }}>
      {Object.entries(diff).map(([champ, [avant, apres]]) => (
        <div key={champ}>
          <span className="texte-mono">{champ}</span> : <Typography.Text delete type="secondary">{String(avant ?? '∅')}</Typography.Text> → <strong>{String(apres ?? '∅')}</strong>
        </div>
      ))}
    </div>
  )
}

/** Module 18 — journal d'audit : connexions, modifications, suppressions, exports, traçabilité complète. */
export default function AuditPage() {
  const [page, setPage] = useState(1)
  const [actions, setActions] = useState<string[]>([])
  const [userId, setUserId] = useState<number>()
  const [q, setQ] = useState('')
  const [periode, setPeriode] = useState<[Dayjs | null, Dayjs | null] | null>(null)

  const filtres = { action: actions.join(','), user_id: userId, q, debut: periode?.[0]?.format('YYYY-MM-DD'), fin: periode?.[1]?.format('YYYY-MM-DD') }
  const { data, isLoading } = useQuery({ queryKey: ['audit', filtres, page], queryFn: () => fetchAudit({ ...filtres, page }) })
  const { data: utilisateurs } = useQuery({ queryKey: ['options', 'tous'], queryFn: () => fetchUserOptions() })

  const colonnes: ColumnsType<AuditEntry> = [
    { title: 'Date', dataIndex: 'createdAt', width: 160, render: (d) => formatDate(d) },
    { title: 'Utilisateur', dataIndex: 'userNom', width: 170 },
    { title: 'Action', dataIndex: 'action', width: 170, render: (a: string) => <Tag color={COULEURS[a] ?? 'default'}>{libelleAction(a)}</Tag> },
    { title: 'Cible', dataIndex: 'cible', width: 140, render: (c) => <span className="texte-mono">{c ?? '—'}</span> },
    { title: 'Détails', dataIndex: 'details', render: (d) => <Details texte={d} /> },
    { title: 'IP', dataIndex: 'ip', width: 120, responsive: ['lg'], render: (ip) => <span className="texte-mono">{ip}</span> },
  ]

  return (
    <div className="pile">
      <EnTete titre="Journal d'audit" sousTitre="Traçabilité complète des actions" actions={<ExportMenu onExport={(format) => exporterAudit(format, filtres)} />} />
      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search placeholder="Détails, cible, IP" allowClear onSearch={(v) => { setQ(v); setPage(1) }} style={{ width: 220 }} />
          <Select mode="multiple" allowClear placeholder="Actions" style={{ minWidth: 220 }} value={actions} onChange={(v) => { setActions(v); setPage(1) }}
            options={(data?.actions ?? []).map((a) => ({ value: a, label: libelleAction(a) }))} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="Utilisateur" style={{ width: 220 }} value={userId} onChange={(v) => { setUserId(v); setPage(1) }}
            options={(utilisateurs ?? []).map((u) => ({ value: u.id, label: u.nom }))} />
          <DatePicker.RangePicker format="DD/MM/YYYY" value={periode} onChange={(v) => { setPeriode(v); setPage(1) }} />
        </Space>
        <Table rowKey="id" size="small" columns={colonnes} dataSource={data?.data} loading={isLoading} scroll={{ x: 900 }}
          pagination={{ current: page, pageSize: 30, total: data?.meta.total, onChange: setPage, showSizeChanger: false, showTotal: (t) => `${t} entrée(s)` }} />
      </Card>
    </div>
  )
}
