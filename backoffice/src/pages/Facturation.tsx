import { useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Button, Card, Col, DatePicker, Dropdown, Form, Input, InputNumber, Modal, Radio, Row, Select, Space, Table, Tabs, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckCircleOutlined, FilePdfOutlined, MoreOutlined, RollbackOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Dayjs } from 'dayjs'
import ReactECharts from '../components/Graphique'
import { errorMessage, fetchFactures, fetchPaiements, fetchResumePaiements, rembourser, regulariser, telechargerFacture } from '../api'
import { useAuth } from '../auth'
import { EnTete, Kpi, Statut } from '../components/commun'
import {
  METHODE_PAIEMENT_LABELS,
  STATUT_FACTURE_COLORS,
  STATUT_FACTURE_LABELS,
  STATUT_PAIEMENT_COLORS,
  STATUT_PAIEMENT_LABELS,
  formatDate,
  formatMontant,
} from '../format'
import type { Facture, Paiement, StatutPaiement } from '../types'

function TablePaiements({ filtres, ecriture }: { filtres: Record<string, unknown>; ecriture: boolean }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [remb, setRemb] = useState<Paiement | null>(null)
  const [regul, setRegul] = useState<Paiement | null>(null)
  const [formR] = Form.useForm()
  const [formG] = Form.useForm()

  const params = { ...filtres, page }
  const { data, isLoading } = useQuery({ queryKey: ['paiements', params], queryFn: () => fetchPaiements(params) })
  const invalider = () => ['paiements', 'factures', 'user'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }))

  const remboursement = useMutation({
    mutationFn: (v: { montant: number; motif: string }) => rembourser(remb!.id, v.montant, v.motif),
    onSuccess: () => {
      message.success('Remboursement effectué')
      setRemb(null)
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const regularisation = useMutation({
    mutationFn: (v: { methode: string }) => regulariser(regul!.id, v.methode),
    onSuccess: () => {
      message.success('Paiement régularisé')
      setRegul(null)
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const colonnes: ColumnsType<Paiement> = [
    { title: 'Date', dataIndex: 'date', render: (d) => formatDate(d) },
    { title: 'Client', dataIndex: 'userNom', render: (n, p) => <Link to={`/utilisateurs/${p.userId}`}>{n}</Link> },
    { title: 'Objet', dataIndex: 'objet' },
    { title: 'Méthode', dataIndex: 'methode', responsive: ['md'], render: (m) => METHODE_PAIEMENT_LABELS[m] ?? m },
    {
      title: 'Montant',
      dataIndex: 'montant',
      align: 'right',
      render: (m, p) => (
        <>
          <Typography.Text strong>{formatMontant(m)}</Typography.Text>
          {p.montantRembourse > 0 && <div style={{ fontSize: 12, color: '#A78BFA' }}>− {formatMontant(p.montantRembourse)} remboursé</div>}
        </>
      ),
    },
    { title: 'Statut', dataIndex: 'statut', render: (s) => <Statut valeur={s} libelles={STATUT_PAIEMENT_LABELS} couleurs={STATUT_PAIEMENT_COLORS} /> },
    { title: 'Référence', dataIndex: 'referencePsp', responsive: ['xl'], render: (r) => <span className="texte-mono">{r ?? '—'}</span> },
    {
      title: '',
      key: 'a',
      width: 50,
      render: (_, p) => {
        const items = [
          ecriture && ['paye', 'rembourse_partiel'].includes(p.statut) && p.methode !== 'ajustement' && {
            key: 'r', icon: <RollbackOutlined />, label: 'Rembourser',
            onClick: () => { formR.setFieldsValue({ montant: +(p.montant - p.montantRembourse).toFixed(2), motif: '' }); setRemb(p) },
          },
          ecriture && p.statut === 'en_attente' && {
            key: 'g', icon: <CheckCircleOutlined />, label: 'Régulariser', onClick: () => { formG.setFieldsValue({ methode: 'especes' }); setRegul(p) },
          },
        ].filter(Boolean) as { key: string }[]
        return items.length ? <Dropdown menu={{ items }} trigger={['click']}><Button size="small" icon={<MoreOutlined />} /></Dropdown> : null
      },
    },
  ]

  return (
    <>
      <Table rowKey="id" size="middle" columns={colonnes} dataSource={data?.data} loading={isLoading}
        pagination={{ current: page, pageSize: 20, total: data?.meta.total, onChange: setPage, showTotal: (t) => `${t} paiement(s)` }} scroll={{ x: 900 }} />

      <Modal open={!!remb} title="Rembourser le paiement" onCancel={() => setRemb(null)} onOk={() => formR.submit()} confirmLoading={remboursement.isPending} okText="Rembourser" okButtonProps={{ danger: true }}>
        {remb && (
          <Typography.Paragraph type="secondary">
            {remb.objet} — {remb.userNom}. {remb.methode === 'wallet' ? 'Le montant sera recrédité sur le wallet.' : remb.methode === 'topup_carte' ? 'Le montant sera débité du wallet et remboursé sur la carte.' : 'Remboursement sur le moyen de paiement d’origine.'}
          </Typography.Paragraph>
        )}
        <Form form={formR} layout="vertical" onFinish={(v) => remboursement.mutate(v)}>
          <Form.Item name="montant" label="Montant" rules={[{ required: true }]}>
            <InputNumber min={0.01} max={remb ? remb.montant - remb.montantRembourse : undefined} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="motif" label="Motif" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal open={!!regul} title="Régulariser un paiement différé" onCancel={() => setRegul(null)} onOk={() => formG.submit()} confirmLoading={regularisation.isPending}>
        <Typography.Paragraph>{regul && `${regul.objet} — ${formatMontant(regul.montant)} dû par ${regul.userNom}`}</Typography.Paragraph>
        <Form form={formG} layout="vertical" onFinish={(v) => regularisation.mutate(v)}>
          <Form.Item name="methode" label="Encaissé par">
            <Radio.Group options={[
              { value: 'especes', label: 'Espèces' },
              { value: 'virement', label: 'Virement' },
              { value: 'carte', label: 'Carte (TPE)' },
              { value: 'wallet', label: 'Wallet du client' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

function TableFactures({ filtres }: { filtres: Record<string, unknown> }) {
  const [page, setPage] = useState(1)
  const [statut, setStatut] = useState<string>()
  const params = { q: filtres.q, debut: filtres.debut, fin: filtres.fin, statut, page }
  const { data, isLoading } = useQuery({ queryKey: ['factures', params], queryFn: () => fetchFactures(params) })

  const colonnes: ColumnsType<Facture> = [
    { title: 'Numéro', dataIndex: 'numero', render: (n) => <span className="texte-mono">{n}</span> },
    { title: 'Date', dataIndex: 'date', render: (d) => formatDate(d, false) },
    { title: 'Client', dataIndex: 'userNom', render: (n, f) => <Link to={`/utilisateurs/${f.userId}`}>{n}</Link> },
    { title: 'HT', dataIndex: 'montantHt', align: 'right', responsive: ['md'], render: (m) => formatMontant(m) },
    { title: 'TVA', dataIndex: 'montantTva', align: 'right', responsive: ['md'], render: (m, f) => `${formatMontant(m)} (${f.tauxTva ?? '—'} %)` },
    { title: 'TTC', dataIndex: 'montantTtc', align: 'right', render: (m) => <strong>{formatMontant(m)}</strong> },
    { title: 'Statut', dataIndex: 'statut', render: (s) => <Statut valeur={s} libelles={STATUT_FACTURE_LABELS} couleurs={STATUT_FACTURE_COLORS} /> },
    { title: '', key: 'pdf', width: 60, render: (_, f) => <Button size="small" icon={<FilePdfOutlined />} onClick={() => telechargerFacture(f.id, f.numero)} /> },
  ]

  return (
    <>
      <Select allowClear placeholder="Statut" style={{ width: 160, marginBottom: 12 }} value={statut} onChange={setStatut}
        options={Object.entries(STATUT_FACTURE_LABELS).map(([value, label]) => ({ value, label }))} />
      <Table rowKey="id" size="middle" columns={colonnes} dataSource={data?.data} loading={isLoading}
        pagination={{ current: page, pageSize: 20, total: data?.meta.total, onChange: setPage, showTotal: (t) => `${t} facture(s)` }} />
    </>
  )
}

/** Module 9 — paiements (carte, wallet, abonnement, différé), factures PDF, historique, remboursements. */
export default function FacturationPage() {
  const { peut } = useAuth()
  const ecriture = peut('paiements', 'ecriture')
  const [q, setQ] = useState('')
  const [methode, setMethode] = useState<string>()
  const [statut, setStatut] = useState<StatutPaiement>()
  const [periode, setPeriode] = useState<[Dayjs | null, Dayjs | null] | null>(null)

  const commun = { q, debut: periode?.[0]?.format('YYYY-MM-DD'), fin: periode?.[1]?.format('YYYY-MM-DD') }
  const { data: resume } = useQuery({ queryKey: ['paiements', 'resume', commun], queryFn: () => fetchResumePaiements(commun) })

  return (
    <div className="pile">
      <EnTete titre="Paiements & facturation" />
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}><Kpi titre="Encaissé" valeur={formatMontant(resume?.encaisse)} couleur="#F2A3AA" /></Col>
        <Col xs={12} lg={6}><Kpi titre="Paiements différés" valeur={formatMontant(resume?.enAttente)} couleur="#D9D9E0" pied={`${resume?.nbEnAttente ?? 0} en attente`} /></Col>
        <Col xs={12} lg={6}><Kpi titre="Remboursé" valeur={formatMontant(resume?.rembourse)} couleur="#A78BFA" /></Col>
        <Col xs={12} lg={6}>
          <Card size="small" className="kpi" styles={{ body: { padding: 4 } }}>
            <ReactECharts
              style={{ height: 92 }}
              option={{
                tooltip: { trigger: 'item', valueFormatter: (v: number) => formatMontant(v) },
                color: ['#E5545F', '#E5545F', '#F4CDC6', '#A78BFA', '#8E8E99', '#FF6B6B'],
                series: [{ type: 'pie', radius: ['50%', '85%'], label: { show: false }, data: resume?.parMethode.map((m) => ({ name: METHODE_PAIEMENT_LABELS[m.methode] ?? m.methode, value: m.total })) }],
              }}
            />
          </Card>
        </Col>
      </Row>
      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search placeholder="Client (nom, email) ou n° facture" allowClear onSearch={setQ} style={{ width: 280 }} />
          <DatePicker.RangePicker format="DD/MM/YYYY" value={periode} onChange={setPeriode} />
        </Space>
        <Tabs
          items={[
            {
              key: 'paiements',
              label: 'Paiements',
              children: (
                <>
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Select allowClear placeholder="Méthode" style={{ width: 200 }} value={methode} onChange={setMethode}
                      options={Object.entries(METHODE_PAIEMENT_LABELS).map(([value, label]) => ({ value, label }))} />
                    <Select allowClear placeholder="Statut" style={{ width: 200 }} value={statut} onChange={setStatut}
                      options={(Object.keys(STATUT_PAIEMENT_LABELS) as StatutPaiement[]).map((s) => ({ value: s, label: STATUT_PAIEMENT_LABELS[s] }))} />
                  </Space>
                  <TablePaiements filtres={{ ...commun, methode, statut }} ecriture={ecriture} />
                </>
              ),
            },
            { key: 'differes', label: `Paiements différés (${resume?.nbEnAttente ?? 0})`, children: <TablePaiements filtres={{ ...commun, statut: 'en_attente' }} ecriture={ecriture} /> },
            { key: 'remboursements', label: 'Remboursements', children: <TablePaiements filtres={{ ...commun, statut: 'rembourse,rembourse_partiel' }} ecriture={ecriture} /> },
            { key: 'factures', label: 'Factures', children: <TableFactures filtres={commun} /> },
          ]}
        />
      </Card>
    </div>
  )
}
