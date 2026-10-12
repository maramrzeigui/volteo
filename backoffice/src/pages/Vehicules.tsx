import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Button, Card, Col, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, EditOutlined, HistoryOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createVehicule, deleteVehicule, errorMessage, fetchSessionsVehicule, fetchUserOptions, fetchVehicules, updateVehicule } from '../api'
import { useAuth } from '../auth'
import { EnTete, Statut } from '../components/commun'
import { ETAT_SESSION_COLORS, ETAT_SESSION_LABELS, formatDate, formatDuree, formatEnergie, formatMontant } from '../format'
import type { TypeConnecteur, Vehicule } from '../types'

const TYPES: TypeConnecteur[] = ['CCS', 'Type2', 'CHAdeMO', 'AC', 'DC']

/** Module 8 — véhicules : marque, modèle, immatriculation, connecteur, batterie, historique. */
export default function VehiculesPage() {
  const { peut } = useAuth()
  const ecriture = peut('vehicules', 'ecriture')
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const [q, setQ] = useState('')
  const [edition, setEdition] = useState<Vehicule | 'nouveau' | null>(null)
  const [historique, setHistorique] = useState<Vehicule | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['vehicules', { q }], queryFn: () => fetchVehicules({ q }) })
  const { data: clients } = useQuery({ queryKey: ['options', 'client'], queryFn: () => fetchUserOptions('client'), enabled: edition !== null })
  const { data: sessions } = useQuery({ queryKey: ['vehicules', 'sessions', historique?.id], queryFn: () => fetchSessionsVehicule(historique!.id), enabled: !!historique })

  useEffect(() => {
    if (edition === null) return
    form.resetFields()
    if (edition !== 'nouveau') form.setFieldsValue(edition)
  }, [edition, form])

  const sauvegarde = useMutation({
    mutationFn: (v: Vehicule) => (edition && edition !== 'nouveau' ? updateVehicule(edition.id, v) : createVehicule(v)),
    onSuccess: () => {
      message.success('Véhicule enregistré')
      queryClient.invalidateQueries({ queryKey: ['vehicules'] })
      setEdition(null)
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const suppression = useMutation({
    mutationFn: deleteVehicule,
    onSuccess: () => {
      message.success('Véhicule supprimé')
      queryClient.invalidateQueries({ queryKey: ['vehicules'] })
    },
  })

  const colonnes: ColumnsType<Vehicule> = [
    { title: 'Véhicule', key: 'v', sorter: (a, b) => a.marque.localeCompare(b.marque), render: (_, v) => <strong>{v.marque} {v.modele}</strong> },
    { title: 'Immatriculation', dataIndex: 'immatriculation', render: (i) => <span className="texte-mono">{i}</span> },
    { title: 'Propriétaire', dataIndex: 'userNom', render: (n, v) => (peut('utilisateurs') ? <Link to={`/utilisateurs/${v.userId}`}>{n}</Link> : n) },
    { title: 'Connecteur', dataIndex: 'typeConnecteur' },
    { title: 'Batterie', dataIndex: 'capaciteBatterieKwh', render: (c) => `${c} kWh` },
    { title: 'Recharges', dataIndex: 'nbSessions', responsive: ['md'], sorter: (a, b) => (a.nbSessions ?? 0) - (b.nbSessions ?? 0) },
    { title: 'Énergie totale', dataIndex: 'energieTotaleKwh', responsive: ['md'], render: (e) => formatEnergie(e) },
    {
      title: '',
      key: 'a',
      width: 120,
      render: (_, v) => (
        <Space size={4}>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => setHistorique(v)} />
          {ecriture && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => setEdition(v)} />
              <Popconfirm title="Supprimer ce véhicule ?" onConfirm={() => suppression.mutate(v.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="pile">
      <EnTete titre="Véhicules" sousTitre={`${data?.length ?? 0} véhicule(s)`} actions={ecriture && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEdition('nouveau')}>Nouveau véhicule</Button>} />
      <Card size="small">
        <Input.Search placeholder="Marque, modèle, immatriculation, propriétaire" allowClear onSearch={setQ} style={{ width: 340, marginBottom: 12 }} />
        <Table rowKey="id" size="middle" columns={colonnes} dataSource={data} loading={isLoading} pagination={{ pageSize: 20, hideOnSinglePage: true }} />
      </Card>

      <Modal open={edition !== null} title={edition === 'nouveau' ? 'Nouveau véhicule' : 'Modifier le véhicule'} onCancel={() => setEdition(null)} onOk={() => form.submit()} confirmLoading={sauvegarde.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(v) => sauvegarde.mutate(v)}>
          <Form.Item name="userId" label="Propriétaire" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(clients ?? []).map((c) => ({ value: c.id, label: `${c.nom} — ${c.email}` }))} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="marque" label="Marque" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="modele" label="Modèle" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="immatriculation" label="Immatriculation" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="typeConnecteur" label="Type de connecteur" rules={[{ required: true }]}><Select options={TYPES.map((t) => ({ value: t, label: t }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="capaciteBatterieKwh" label="Capacité batterie" rules={[{ required: true }]}><InputNumber min={1} max={300} addonAfter="kWh" style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      <Drawer open={!!historique} onClose={() => setHistorique(null)} width={720} title={historique && `Recharges — ${historique.marque} ${historique.modele} (${historique.immatriculation})`}>
        <Table rowKey="id" size="small" dataSource={sessions} pagination={{ pageSize: 15, hideOnSinglePage: true }}
          columns={[
            { title: 'Date', dataIndex: 'dateDebut', render: (d) => formatDate(d) },
            { title: 'Borne', dataIndex: 'borneNom' },
            { title: 'Durée', dataIndex: 'dureeMinutes', render: (m) => formatDuree(m) },
            { title: 'Énergie', dataIndex: 'energieKwh', render: (e) => formatEnergie(e) },
            { title: 'Montant', dataIndex: 'prix', render: (p) => formatMontant(p) },
            { title: 'État', dataIndex: 'etat', render: (e) => <Statut valeur={e} libelles={ETAT_SESSION_LABELS} couleurs={ETAT_SESSION_COLORS} /> },
          ]}
        />
      </Drawer>
    </div>
  )
}
