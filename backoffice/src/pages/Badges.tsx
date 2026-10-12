import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Button, Card, Col, DatePicker, Drawer, Dropdown, Form, Input, Modal, Row, Select, Space, Switch, Table, Timeline, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { HistoryOutlined, LockOutlined, MoreOutlined, PlusOutlined, UnlockOutlined, EditOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  bloquerBadge,
  createBadge,
  debloquerBadge,
  errorMessage,
  fetchBadges,
  fetchHistoriqueBadge,
  fetchUserOptions,
  updateBadge,
} from '../api'
import { useAuth } from '../auth'
import { EnTete, Kpi, Statut } from '../components/commun'
import { EVENEMENT_BADGE_LABELS, STATUT_BADGE_COLORS, STATUT_BADGE_LABELS, formatDate, formatRelatif } from '../format'
import type { Badge, StatutBadge } from '../types'

function BadgeForm({ badge, ouvert, onFermer }: { badge: Badge | null; ouvert: boolean; onFermer: () => void }) {
  const [form] = Form.useForm()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { data: clients } = useQuery({ queryKey: ['options', 'client'], queryFn: () => fetchUserOptions('client'), enabled: ouvert })

  useEffect(() => {
    if (!ouvert) return
    form.resetFields()
    form.setFieldsValue(badge ? { ...badge, dateExpiration: badge.dateExpiration ? dayjs(badge.dateExpiration) : null } : { dateExpiration: dayjs().add(2, 'year'), actif: true })
  }, [ouvert, badge, form])

  const sauvegarde = useMutation({
    mutationFn: (v: { uid: string; libelle?: string; userId?: number | null; dateExpiration?: dayjs.Dayjs | null; actif?: boolean }) => {
      const corps = { ...v, userId: v.userId ?? null, dateExpiration: v.dateExpiration ? v.dateExpiration.format('YYYY-MM-DD') : null }
      return badge ? updateBadge(badge.id, corps) : createBadge(corps)
    },
    onSuccess: () => {
      message.success('Badge enregistré')
      queryClient.invalidateQueries({ queryKey: ['badges'] })
      onFermer()
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  return (
    <Modal open={ouvert} title={badge ? `Badge ${badge.uid}` : 'Nouveau badge RFID'} onCancel={onFermer} onOk={() => form.submit()} confirmLoading={sauvegarde.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => sauvegarde.mutate(v)}>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="uid" label="UID" rules={[{ required: !badge }]}><Input disabled={!!badge} placeholder="04:A1:B2:C3" className="texte-mono" /></Form.Item></Col>
          <Col span={12}><Form.Item name="libelle" label="Libellé"><Input placeholder="Badge principal" /></Form.Item></Col>
        </Row>
        <Form.Item name="userId" label="Associé à" extra="Laisser vide pour un badge en stock">
          <Select allowClear showSearch optionFilterProp="label" options={(clients ?? []).map((c) => ({ value: c.id, label: `${c.nom} — ${c.email}` }))} />
        </Form.Item>
        <Row gutter={12}>
          <Col span={14}><Form.Item name="dateExpiration" label="Date d'expiration"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
          {badge && <Col span={10}><Form.Item name="actif" label="Activé" valuePropName="checked"><Switch /></Form.Item></Col>}
        </Row>
      </Form>
    </Modal>
  )
}

/** Module 7 — association, activation, blocage, expiration, historique des badges RFID. */
export default function BadgesPage() {
  const { peut } = useAuth()
  const ecriture = peut('rfid', 'ecriture')
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [statut, setStatut] = useState<StatutBadge>()
  const [edition, setEdition] = useState<Badge | null>(null)
  const [ouvert, setOuvert] = useState(false)
  const [historique, setHistorique] = useState<Badge | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['badges', { q, statut }], queryFn: () => fetchBadges({ q, statut }) })
  const { data: tous } = useQuery({ queryKey: ['badges', {}], queryFn: () => fetchBadges() })
  const { data: evenements } = useQuery({ queryKey: ['badges', 'historique', historique?.id], queryFn: () => fetchHistoriqueBadge(historique!.id), enabled: !!historique })

  const blocage = useMutation({
    mutationFn: ({ b, motif }: { b: Badge; motif?: string }) => (b.bloque ? debloquerBadge(b.id) : bloquerBadge(b.id, motif ?? '')),
    onSuccess: (b) => {
      message.success(b.bloque ? 'Badge bloqué : il sera refusé par les bornes' : 'Badge débloqué')
      queryClient.invalidateQueries({ queryKey: ['badges'] })
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const bloquer = (b: Badge) => {
    if (b.bloque) return blocage.mutate({ b })
    let motif = ''
    modal.confirm({
      title: `Bloquer le badge ${b.uid} ?`,
      content: <Input placeholder="Motif (perte, vol, fraude…)" onChange={(e) => (motif = e.target.value)} style={{ marginTop: 8 }} />,
      okText: 'Bloquer',
      okButtonProps: { danger: true },
      onOk: () => (motif.trim() ? blocage.mutateAsync({ b, motif }) : Promise.reject(message.warning('Motif requis'))),
    })
  }

  const compte = (s: StatutBadge) => (tous ?? []).filter((b) => b.statut === s).length

  const colonnes: ColumnsType<Badge> = [
    { title: 'UID', dataIndex: 'uid', render: (u, b) => <><span className="texte-mono">{u}</span>{b.libelle && <div style={{ fontSize: 12, color: 'var(--texte-doux)' }}>{b.libelle}</div>}</> },
    { title: 'Titulaire', dataIndex: 'userNom', render: (n, b) => (n ? (peut('utilisateurs') ? <Link to={`/utilisateurs/${b.userId}`}>{n}</Link> : n) : <Typography.Text type="secondary">En stock</Typography.Text>) },
    { title: 'Statut', dataIndex: 'statut', render: (s, b) => <><Statut valeur={s} libelles={STATUT_BADGE_LABELS} couleurs={STATUT_BADGE_COLORS} />{b.motifBlocage && <div style={{ fontSize: 12, color: '#FF6B6B' }}>{b.motifBlocage}</div>}</> },
    { title: 'Expiration', dataIndex: 'dateExpiration', render: (d) => formatDate(d, false) },
    { title: 'Dernière utilisation', dataIndex: 'derniereUtilisation', responsive: ['md'], render: (d) => formatRelatif(d) },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, b) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'h', icon: <HistoryOutlined />, label: 'Historique', onClick: () => setHistorique(b) },
              ...(ecriture
                ? [
                    { key: 'e', icon: <EditOutlined />, label: 'Modifier / associer', onClick: () => { setEdition(b); setOuvert(true) } },
                    { key: 'b', icon: b.bloque ? <UnlockOutlined /> : <LockOutlined />, danger: !b.bloque, label: b.bloque ? 'Débloquer' : 'Bloquer', onClick: () => bloquer(b) },
                  ]
                : []),
            ],
          }}
        >
          <Button size="small" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ]

  return (
    <div className="pile">
      <EnTete titre="Badges RFID" actions={ecriture && <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEdition(null); setOuvert(true) }}>Nouveau badge</Button>} />
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Kpi titre="Actifs" valeur={compte('actif')} couleur="#F2A3AA" /></Col>
        <Col xs={12} md={6}><Kpi titre="En stock" valeur={compte('non_associe')} couleur="#E5545F" /></Col>
        <Col xs={12} md={6}><Kpi titre="Bloqués" valeur={compte('bloque')} couleur="#FF6B6B" /></Col>
        <Col xs={12} md={6}><Kpi titre="Expirés" valeur={compte('expire')} couleur="#D9D9E0" /></Col>
      </Row>
      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search placeholder="UID, libellé, titulaire" allowClear onSearch={setQ} style={{ width: 260 }} />
          <Select allowClear placeholder="Statut" style={{ width: 180 }} value={statut} onChange={setStatut}
            options={(Object.keys(STATUT_BADGE_LABELS) as StatutBadge[]).map((s) => ({ value: s, label: STATUT_BADGE_LABELS[s] }))} />
        </Space>
        <Table rowKey="id" size="middle" columns={colonnes} dataSource={data} loading={isLoading} pagination={{ pageSize: 20, hideOnSinglePage: true }} />
      </Card>
      <BadgeForm badge={edition} ouvert={ouvert} onFermer={() => setOuvert(false)} />
      <Drawer open={!!historique} onClose={() => setHistorique(null)} title={`Historique du badge ${historique?.uid ?? ''}`} width={460}>
        <Timeline
          items={(evenements ?? []).map((e) => ({
            color: e.evenement.includes('refusee') || e.evenement === 'blocage' ? 'red' : e.evenement.includes('acceptee') || e.evenement === 'recharge_demarree' ? 'green' : 'processing',
            children: (
              <>
                <Typography.Text strong>{EVENEMENT_BADGE_LABELS[e.evenement] ?? e.evenement}</Typography.Text>
                {e.details && <> — {e.details}</>}
                <div style={{ fontSize: 12, color: 'var(--texte-doux)' }}>
                  {formatDate(e.date)} · {e.acteur}{e.borneNom && ` · ${e.borneNom}`}
                </div>
              </>
            ),
          }))}
        />
      </Drawer>
    </div>
  )
}
