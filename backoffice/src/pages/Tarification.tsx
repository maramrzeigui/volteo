import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  TimePicker,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CalculatorOutlined, DeleteOutlined, EditOutlined, NodeIndexOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import {
  affecterTarif,
  archiverTarif,
  errorMessage,
  fetchAbonnements,
  fetchBornes,
  fetchSouscriptions,
  fetchTarifs,
  saveAbonnement,
  saveTarif,
  simulerTarif,
} from '../api'
import { useAuth } from '../auth'
import { EnTete } from '../components/commun'
import { MODE_TARIF_LABELS, MODE_TARIF_UNITES, formatDate, formatMontant } from '../format'
import type { Abonnement, ModeTarif, Tarif } from '../types'

interface ValeursTarif extends Omit<Tarif, 'heuresCreusesDebut' | 'heuresCreusesFin' | 'valideDu' | 'valideAu'> {
  heuresCreuses?: [Dayjs, Dayjs] | null
  validite?: [Dayjs | null, Dayjs | null] | null
}

function Tarifs({ ecriture, station }: { ecriture: boolean; station: { id: number; nom: string } | null }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<ValeursTarif>()
  const [formA] = Form.useForm()
  const [edition, setEdition] = useState<Tarif | 'nouveau' | null>(null)
  const [affectation, setAffectation] = useState<Tarif | null>(null)
  const avecHc = Form.useWatch('prixHeuresCreuses', form) != null

  const { data, isLoading } = useQuery({ queryKey: ['tarifs'], queryFn: fetchTarifs })
  const { data: bornes } = useQuery({ queryKey: ['bornes', {}], queryFn: () => fetchBornes(), enabled: !!affectation })
  const invalider = () => {
    queryClient.invalidateQueries({ queryKey: ['tarifs'] })
    queryClient.invalidateQueries({ queryKey: ['bornes'] })
  }

  useEffect(() => {
    if (edition === null) return
    form.resetFields()
    if (edition === 'nouveau') {
      form.setFieldsValue({ mode: 'kwh', prix: 0.5, fraisSession: 0, actif: true, special: false })
    } else {
      form.setFieldsValue({
        ...edition,
        heuresCreuses: edition.heuresCreusesDebut && edition.heuresCreusesFin ? [dayjs(edition.heuresCreusesDebut, 'HH:mm'), dayjs(edition.heuresCreusesFin, 'HH:mm')] : undefined,
        validite: edition.valideDu || edition.valideAu ? [edition.valideDu ? dayjs(edition.valideDu) : null, edition.valideAu ? dayjs(edition.valideAu) : null] : undefined,
      })
    }
  }, [edition, form])

  const sauvegarde = useMutation({
    mutationFn: (v: ValeursTarif) =>
      saveTarif(
        {
          ...v,
          prixHeuresCreuses: v.prixHeuresCreuses ?? null,
          heuresCreusesDebut: v.heuresCreuses?.[0]?.format('HH:mm') ?? null,
          heuresCreusesFin: v.heuresCreuses?.[1]?.format('HH:mm') ?? null,
          valideDu: v.validite?.[0]?.format('YYYY-MM-DD') ?? null,
          valideAu: v.validite?.[1]?.format('YYYY-MM-DD') ?? null,
        },
        edition && edition !== 'nouveau' ? edition.id : undefined,
      ),
    onSuccess: () => {
      message.success('Tarif enregistré')
      setEdition(null)
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const archivage = useMutation({
    mutationFn: archiverTarif,
    onSuccess: (r) => {
      message.success(r.message)
      invalider()
    },
  })
  const affecte = useMutation({
    mutationFn: (v: { borneIds: number[]; special: boolean }) => affecterTarif(affectation!.id, v.borneIds, v.special),
    onSuccess: (r) => {
      message.success(r.message)
      setAffectation(null)
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const colonnes: ColumnsType<Tarif> = [
    {
      title: 'Tarif',
      dataIndex: 'nom',
      render: (n, t) => (
        <div>
          <Space size={4}>
            <strong>{n}</strong>
            {t.special && <Tag color="error">Spécial</Tag>}
            {station && t.stationId == null && <Tag>Tarif Volteo</Tag>}
            {!t.actif && <Tag>Archivé</Tag>}
          </Space>
          {t.description && <div style={{ fontSize: 12, color: 'var(--texte-doux)' }}>{t.description}</div>}
        </div>
      ),
    },
    { title: 'Mode', dataIndex: 'mode', render: (m: ModeTarif) => MODE_TARIF_LABELS[m] },
    { title: 'Heures pleines', dataIndex: 'prix', render: (p, t) => `${formatMontant(p, 3)} ${MODE_TARIF_UNITES[t.mode]}` },
    {
      title: 'Heures creuses',
      dataIndex: 'prixHeuresCreuses',
      responsive: ['md'],
      render: (p, t) => (p != null ? <>{formatMontant(p, 3)}<div style={{ fontSize: 12, color: 'var(--texte-doux)' }}>{t.heuresCreusesDebut} → {t.heuresCreusesFin}</div></> : '—'),
    },
    { title: 'Frais / session', dataIndex: 'fraisSession', responsive: ['lg'], render: (f) => (f ? formatMontant(f) : '—') },
    { title: 'Validité', key: 'v', responsive: ['lg'], render: (_, t) => (t.valideDu || t.valideAu ? `${formatDate(t.valideDu, false)} → ${formatDate(t.valideAu, false)}` : 'Permanente') },
    { title: 'Bornes', dataIndex: 'nbBornes', align: 'center' },
    {
      title: '',
      key: 'a',
      width: 130,
      render: (_, t) =>
        ecriture && (
          <Space size={4}>
            <Button size="small" icon={<NodeIndexOutlined />} title="Appliquer à des bornes" disabled={!t.actif} onClick={() => { formA.setFieldsValue({ borneIds: [], special: t.special }); setAffectation(t) }} />
            {/* Une station ne modifie que ses propres tarifs ; ceux de la plateforme s'appliquent seulement. */}
            {!(station && t.stationId == null) && <Button size="small" icon={<EditOutlined />} onClick={() => setEdition(t)} />}
            {t.actif && !(station && t.stationId == null) && (
              <Popconfirm title="Archiver ce tarif ?" description="Il sera retiré des bornes qui l'utilisent." onConfirm={() => archivage.mutate(t.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        ),
    },
  ]

  return (
    <>
      {ecriture && <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setEdition('nouveau')}>Nouveau tarif</Button>}
      <Table rowKey="id" size="middle" columns={colonnes} dataSource={data} loading={isLoading} pagination={false} scroll={{ x: 900 }} />

      <Modal open={edition !== null} title={edition === 'nouveau' ? 'Nouveau tarif' : 'Modifier le tarif'} width={640} onCancel={() => setEdition(null)} onOk={() => form.submit()} confirmLoading={sauvegarde.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(v) => sauvegarde.mutate(v)}>
          <Row gutter={12}>
            <Col span={14}><Form.Item name="nom" label="Nom" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={10}>
              <Form.Item name="mode" label="Mode de facturation" rules={[{ required: true }]}>
                <Select options={(Object.keys(MODE_TARIF_LABELS) as ModeTarif[]).map((m) => ({ value: m, label: MODE_TARIF_LABELS[m] }))} />
              </Form.Item>
            </Col>
            <Col span={8}><Form.Item name="prix" label="Prix (heures pleines)" rules={[{ required: true }]}><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="prixHeuresCreuses" label="Prix heures creuses"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}>
              <Form.Item name="heuresCreuses" label="Plage heures creuses" rules={[{ required: avecHc, message: 'Plage requise' }]}>
                <TimePicker.RangePicker format="HH:mm" minuteStep={15} order={false} disabled={!avecHc} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}><Form.Item name="fraisSession" label="Frais fixes par session"><InputNumber min={0} step={0.1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={16}><Form.Item name="validite" label="Période de validité (facultatif)"><DatePicker.RangePicker allowEmpty={[true, true]} format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={24}><Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item></Col>
            <Col span={12}><Form.Item name="special" valuePropName="checked"><Checkbox>Tarif spécial (prioritaire sur le tarif standard)</Checkbox></Form.Item></Col>
            <Col span={12}><Form.Item name="actif" label="Actif" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      <Modal open={!!affectation} title={`Appliquer « ${affectation?.nom} »`} onCancel={() => setAffectation(null)} onOk={() => formA.submit()} confirmLoading={affecte.isPending}>
        <Form form={formA} layout="vertical" onFinish={(v) => affecte.mutate(v)}>
          <Form.Item name="borneIds" label="Bornes" rules={[{ required: true }]}>
            <Select mode="multiple" showSearch optionFilterProp="label" options={(bornes ?? []).map((b) => ({ value: b.id, label: b.nom }))} />
          </Form.Item>
          <Form.Item name="special" valuePropName="checked"><Checkbox>Appliquer comme tarif spécial</Checkbox></Form.Item>
        </Form>
      </Modal>
    </>
  )
}

function Simulateur() {
  const [form] = Form.useForm()
  const { data: tarifs } = useQuery({ queryKey: ['tarifs'], queryFn: fetchTarifs })
  const simulation = useMutation({ mutationFn: simulerTarif })

  return (
    <Row gutter={24}>
      <Col xs={24} md={12}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ energieKwh: 30, dureeMinutes: 45, puissanceKw: 50, heure: dayjs('18:00', 'HH:mm'), remisePourcent: 0 }}
          onFinish={(v) => simulation.mutate({ ...v, heureDebut: v.heure.format('HH:mm') })}
        >
          <Form.Item name="tarifId" label="Tarif" rules={[{ required: true }]}>
            <Select options={(tarifs ?? []).filter((t) => t.actif).map((t) => ({ value: t.id, label: `${t.nom} (${MODE_TARIF_LABELS[t.mode]})` }))} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="energieKwh" label="Énergie"><InputNumber min={0} addonAfter="kWh" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="dureeMinutes" label="Durée"><InputNumber min={1} addonAfter="min" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="puissanceKw" label="Puissance de la prise"><InputNumber min={1} addonAfter="kW" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="heure" label="Heure de début"><TimePicker format="HH:mm" minuteStep={15} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="remisePourcent" label="Remise abonnement"><InputNumber min={0} max={100} addonAfter="%" style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Button type="primary" htmlType="submit" icon={<CalculatorOutlined />} loading={simulation.isPending}>Calculer</Button>
        </Form>
      </Col>
      <Col xs={24} md={12}>
        {simulation.data ? (
          <Card>
            <Statistic title="Prix de la recharge" value={formatMontant(simulation.data.prix)} valueStyle={{ fontSize: 36, color: '#E5545F' }} />
            <Descriptions column={1} size="small" style={{ marginTop: 16 }}>
              <Descriptions.Item label="Période">{simulation.data.heuresCreuses ? <Tag color="processing">Heures creuses</Tag> : <Tag color="warning">Heures pleines</Tag>}</Descriptions.Item>
              <Descriptions.Item label="Prix unitaire">{formatMontant(simulation.data.prixUnitaire, 3)}</Descriptions.Item>
              <Descriptions.Item label="Avant remise">{formatMontant(simulation.data.prixBrut)}</Descriptions.Item>
            </Descriptions>
          </Card>
        ) : (
          <Alert type="info" showIcon message="Simulateur de prix" description="Estimez le coût d'une recharge type pour chaque tarif : utile avant de modifier une grille tarifaire." />
        )}
      </Col>
    </Row>
  )
}

function Abonnements({ ecriture }: { ecriture: boolean }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const [edition, setEdition] = useState<Abonnement | 'nouveau' | null>(null)
  const { data } = useQuery({ queryKey: ['abonnements'], queryFn: fetchAbonnements })

  useEffect(() => {
    if (edition === null) return
    form.resetFields()
    form.setFieldsValue(edition === 'nouveau' ? { prixMensuel: 20, remisePourcent: 5, kwhInclus: 0, actif: true } : edition)
  }, [edition, form])

  const sauvegarde = useMutation({
    mutationFn: (v: Partial<Abonnement>) => saveAbonnement(v, edition && edition !== 'nouveau' ? edition.id : undefined),
    onSuccess: () => {
      message.success('Formule enregistrée')
      setEdition(null)
      queryClient.invalidateQueries({ queryKey: ['abonnements'] })
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  return (
    <>
      {ecriture && <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setEdition('nouveau')}>Nouvelle formule</Button>}
      <Row gutter={[16, 16]}>
        {(data ?? []).map((a) => (
          <Col xs={24} md={12} xl={8} key={a.id}>
            <Card
              title={<Space>{a.nom}{!a.actif && <Tag>Inactive</Tag>}</Space>}
              extra={ecriture && <Button size="small" icon={<EditOutlined />} onClick={() => setEdition(a)} />}
            >
              <Typography.Title level={3} style={{ marginTop: 0 }}>{formatMontant(a.prixMensuel)}<Typography.Text type="secondary" style={{ fontSize: 14 }}> / mois</Typography.Text></Typography.Title>
              <Typography.Paragraph type="secondary">{a.description}</Typography.Paragraph>
              <Space wrap>
                <Tag color="processing">{a.remisePourcent} % de remise</Tag>
                <Tag color="success">{a.kwhInclus} kWh inclus</Tag>
                <Tag>{a.nbAbonnes ?? 0} abonné(s)</Tag>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
      <Modal open={edition !== null} title={edition === 'nouveau' ? 'Nouvelle formule' : 'Modifier la formule'} onCancel={() => setEdition(null)} onOk={() => form.submit()} confirmLoading={sauvegarde.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(v) => sauvegarde.mutate(v)}>
          <Form.Item name="nom" label="Nom" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="prixMensuel" label="Prix mensuel" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="remisePourcent" label="Remise" rules={[{ required: true }]}><InputNumber min={0} max={100} addonAfter="%" style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="kwhInclus" label="kWh inclus / mois" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="actif" label="Proposée aux clients" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </>
  )
}

function Souscriptions() {
  const [statut, setStatut] = useState<string>('active')
  const { data, isLoading } = useQuery({ queryKey: ['souscriptions', statut], queryFn: () => fetchSouscriptions({ statut }) })
  return (
    <>
      <Select value={statut} onChange={setStatut} allowClear placeholder="Statut" style={{ width: 160, marginBottom: 12 }}
        options={[{ value: 'active', label: 'Actives' }, { value: 'expiree', label: 'Expirées' }, { value: 'resiliee', label: 'Résiliées' }]} />
      <Table rowKey="id" size="middle" loading={isLoading} dataSource={data} pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={[
          { title: 'Client', dataIndex: 'userNom', render: (n, s) => <Link to={`/utilisateurs/${s.userId}`}>{n}</Link> },
          { title: 'Formule', dataIndex: 'abonnementNom' },
          { title: 'Période', key: 'p', render: (_, s) => `${formatDate(s.dateDebut, false)} → ${formatDate(s.dateFin, false)}` },
          { title: 'Renouvellement', dataIndex: 'renouvellementAuto', render: (r) => (r ? 'Automatique' : 'Non') },
          { title: 'Statut', dataIndex: 'statut', render: (s) => <Tag color={s === 'active' ? 'green' : 'default'}>{s}</Tag> },
        ]}
      />
    </>
  )
}

/** Module 10 — tarification (kWh, minute, heure, puissance, heures pleines / creuses, spéciaux) et abonnements. */
export default function TarificationPage() {
  const { peut, user } = useAuth()
  const ecriture = peut('tarification', 'ecriture')
  const station = user?.station ?? null
  return (
    <div className="pile">
      <EnTete titre="Tarification & abonnements" sousTitre="Le tarif spécial valide d'une borne prime sur son tarif standard ; sans tarif, le prix de repli au kWh s'applique." />
      <Card size="small">
        <Tabs
          items={[
            { key: 'tarifs', label: 'Tarifs', children: <Tarifs ecriture={ecriture} station={station} /> },
            { key: 'simulateur', label: 'Simulateur', children: <Simulateur /> },
            { key: 'abonnements', label: 'Formules d’abonnement', children: <Abonnements ecriture={ecriture && !station} /> },
            { key: 'souscriptions', label: 'Abonnés', children: <Souscriptions /> },
          ]}
        />
      </Card>
    </div>
  )
}
