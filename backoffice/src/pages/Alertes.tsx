import { useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Button, Card, Col, Dropdown, Form, Input, Modal, Row, Segmented, Select, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckOutlined, MailOutlined, MessageOutlined, MoreOutlined, NotificationOutlined, ToolOutlined, UserAddOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPanne, errorMessage, fetchAlertes, fetchNotifications, prendreEnCharge, resoudreAlerte } from '../api'
import { useAuth } from '../auth'
import { EnTete, Kpi, Statut } from '../components/commun'
import { GRAVITE_COLORS, GRAVITE_LABELS, GRAVITE_PANNE_LABELS, TYPE_ALERTE_LABELS, TYPE_PANNE_LABELS, formatDate, formatRelatif } from '../format'
import type { Alerte, GraviteAlerte, NotificationEnvoyee } from '../types'

const ICONES_CANAL = { email: <MailOutlined />, sms: <MessageOutlined />, push: <NotificationOutlined /> }

function Notifications() {
  const [canal, setCanal] = useState<string>()
  const { data, isLoading } = useQuery({ queryKey: ['notifications', canal], queryFn: () => fetchNotifications({ canal }) })
  const colonnes: ColumnsType<NotificationEnvoyee> = [
    { title: 'Date', dataIndex: 'date', render: (d) => formatDate(d) },
    { title: 'Canal', dataIndex: 'canal', render: (c: NotificationEnvoyee['canal']) => <Space>{ICONES_CANAL[c]}{c.toUpperCase()}</Space> },
    { title: 'Destinataire', dataIndex: 'destinataire' },
    { title: 'Sujet', dataIndex: 'sujet', ellipsis: true },
    {
      title: 'Statut',
      dataIndex: 'statut',
      render: (s, n) => (
        <Tooltip title={n.erreur}>
          <Tag color={s === 'envoyee' ? 'green' : s === 'echec' ? 'red' : 'default'}>{s === 'envoyee' ? 'Envoyée' : s === 'echec' ? 'Échec' : 'Canal désactivé'}</Tag>
        </Tooltip>
      ),
    },
  ]
  return (
    <>
      <Segmented style={{ marginBottom: 12 }} value={canal ?? 'tous'} onChange={(v) => setCanal(v === 'tous' ? undefined : String(v))}
        options={[{ label: 'Tous', value: 'tous' }, { label: 'Email', value: 'email' }, { label: 'SMS', value: 'sms' }, { label: 'Push', value: 'push' }]} />
      <Table rowKey="id" size="middle" columns={colonnes} dataSource={data} loading={isLoading} pagination={{ pageSize: 20, hideOnSinglePage: true }} />
    </>
  )
}

/** Module 12 — alertes automatiques et notifications. */
export default function AlertesPage() {
  const { peut } = useAuth()
  const ecriture = peut('alertes', 'ecriture')
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const [vue, setVue] = useState<'ouvertes' | 'resolues' | 'toutes'>('ouvertes')
  const [gravite, setGravite] = useState<GraviteAlerte>()
  const [type, setType] = useState<string>()
  const [panne, setPanne] = useState<Alerte | null>(null)

  const params = { resolue: vue === 'toutes' ? undefined : vue === 'resolues' ? 1 : 0, gravite, type }
  const { data, isLoading } = useQuery({ queryKey: ['alertes', params], queryFn: () => fetchAlertes(params), refetchInterval: 30_000 })
  const { data: ouvertes } = useQuery({ queryKey: ['alertes', { resolue: 0 }], queryFn: () => fetchAlertes({ resolue: 0 }) })

  const invalider = () => ['alertes', 'stats', 'pannes', 'supervision'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }))
  const charge = useMutation({ mutationFn: prendreEnCharge, onSuccess: () => { message.success('Alerte prise en charge'); invalider() } })
  const resolution = useMutation({ mutationFn: resoudreAlerte, onSuccess: () => { message.success('Alerte résolue'); invalider() } })
  const declaration = useMutation({
    mutationFn: (v: { type: string; gravite: string; description: string }) => createPanne({ ...v, borneId: panne!.borneId, alerteId: panne!.id }),
    onSuccess: () => {
      message.success('Panne déclarée — créez l’ordre de travail depuis Maintenance › Pannes')
      setPanne(null)
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const compte = (g: GraviteAlerte) => (ouvertes ?? []).filter((a) => a.gravite === g).length

  const colonnes: ColumnsType<Alerte> = [
    { title: 'Date', dataIndex: 'createdAt', render: (d) => <Tooltip title={formatDate(d)}>{formatRelatif(d)}</Tooltip> },
    { title: 'Gravité', dataIndex: 'gravite', render: (g) => <Statut valeur={g} libelles={GRAVITE_LABELS} couleurs={GRAVITE_COLORS} /> },
    { title: 'Type', dataIndex: 'type', render: (t) => TYPE_ALERTE_LABELS[t] ?? t },
    { title: 'Borne', dataIndex: 'borneNom', render: (n, a) => <Link to={`/bornes/${a.borneId}`}>{n}</Link> },
    { title: 'Message', dataIndex: 'message', ellipsis: true },
    {
      title: 'Suivi',
      key: 's',
      responsive: ['lg'],
      render: (_, a) =>
        a.resolue ? (
          <Typography.Text type="success">Résolue {a.resolueParNom && `par ${a.resolueParNom}`}<br /><span style={{ fontSize: 12 }}>{formatDate(a.resolueLe)}</span></Typography.Text>
        ) : a.priseEnChargeParNom ? (
          <Tag color="processing">Prise en charge : {a.priseEnChargeParNom}</Tag>
        ) : (
          <Tag color="error">Non traitée</Tag>
        ),
    },
    { title: 'Notifs', dataIndex: 'nbNotifications', align: 'center', responsive: ['xl'] },
    {
      title: '',
      key: 'a',
      width: 50,
      render: (_, a) =>
        ecriture && !a.resolue && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'c', icon: <UserAddOutlined />, label: 'Prendre en charge', disabled: !!a.priseEnChargeParNom, onClick: () => charge.mutate(a.id) },
                { key: 'p', icon: <ToolOutlined />, label: 'Déclarer une panne', onClick: () => { form.setFieldsValue({ type: a.type === 'borne_deconnectee' ? 'communication' : 'electrique', gravite: a.gravite === 'critique' ? 'critique' : 'moyenne', description: a.message }); setPanne(a) } },
                { key: 'r', icon: <CheckOutlined />, label: 'Marquer résolue', onClick: () => resolution.mutate(a.id) },
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
      <EnTete titre="Alertes" sousTitre="Borne déconnectée, défaut matériel, surchauffe, coupure électrique, porte ouverte, erreur OCPP" />
      <Row gutter={[16, 16]}>
        <Col xs={8}><Kpi titre="Critiques" valeur={compte('critique')} couleur="#FF6B6B" /></Col>
        <Col xs={8}><Kpi titre="Avertissements" valeur={compte('warning')} couleur="#D9D9E0" /></Col>
        <Col xs={8}><Kpi titre="Informations" valeur={compte('info')} couleur="#E5545F" /></Col>
      </Row>
      <Card size="small">
        <Tabs
          items={[
            {
              key: 'alertes',
              label: 'Alertes',
              children: (
                <>
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Segmented value={vue} onChange={(v) => setVue(v as typeof vue)} options={[{ label: 'Ouvertes', value: 'ouvertes' }, { label: 'Résolues', value: 'resolues' }, { label: 'Toutes', value: 'toutes' }]} />
                    <Select allowClear placeholder="Gravité" style={{ width: 160 }} value={gravite} onChange={setGravite} options={(Object.keys(GRAVITE_LABELS) as GraviteAlerte[]).map((g) => ({ value: g, label: GRAVITE_LABELS[g] }))} />
                    <Select allowClear placeholder="Type" style={{ width: 200 }} value={type} onChange={setType} options={Object.entries(TYPE_ALERTE_LABELS).map(([value, label]) => ({ value, label }))} />
                  </Space>
                  <Table rowKey="id" size="middle" columns={colonnes} dataSource={data} loading={isLoading} pagination={{ pageSize: 20, hideOnSinglePage: true }} scroll={{ x: 900 }} />
                </>
              ),
            },
            { key: 'notifications', label: 'Notifications envoyées', children: <Notifications /> },
          ]}
        />
      </Card>
      <Modal open={!!panne} title={`Déclarer une panne — ${panne?.borneNom}`} onCancel={() => setPanne(null)} onOk={() => form.submit()} confirmLoading={declaration.isPending}>
        <Form form={form} layout="vertical" onFinish={(v) => declaration.mutate(v)}>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="type" label="Type"><Select options={Object.entries(TYPE_PANNE_LABELS).map(([value, label]) => ({ value, label }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="gravite" label="Gravité"><Select options={Object.entries(GRAVITE_PANNE_LABELS).map(([value, label]) => ({ value, label }))} /></Form.Item></Col>
          </Row>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
