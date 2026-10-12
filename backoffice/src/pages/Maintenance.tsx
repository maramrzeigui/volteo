import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  App,
  Badge,
  Button,
  Calendar,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CameraOutlined,
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SendOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import {
  ajouterCommentaire,
  ajouterIntervention,
  ajouterPhoto,
  ajouterPiece,
  createMaintenance,
  createPanne,
  deleteMaintenance,
  errorMessage,
  fetchBornes,
  fetchMaintenance,
  fetchMaintenances,
  fetchPannes,
  fetchUserOptions,
  supprimerIntervention,
  supprimerPiece,
  updateMaintenance,
  updatePanne,
} from '../api'
import { useAuth } from '../auth'
import { EnTete, ImageProtegee, Kpi, Statut } from '../components/commun'
import {
  GRAVITE_PANNE_COLORS,
  GRAVITE_PANNE_LABELS,
  PRIORITE_COLORS,
  PRIORITE_LABELS,
  STATUT_MAINTENANCE_COLORS,
  STATUT_MAINTENANCE_LABELS,
  STATUT_PANNE_COLORS,
  STATUT_PANNE_LABELS,
  TYPE_PANNE_LABELS,
  formatDate,
  formatMontant,
} from '../format'
import type { Maintenance, MaintenanceInput, Panne, PrioriteMaintenance, StatutMaintenance } from '../types'

const COULEUR_CALENDRIER: Record<StatutMaintenance, 'processing' | 'warning' | 'success' | 'default'> = {
  planifiee: 'processing',
  en_cours: 'warning',
  terminee: 'success',
  annulee: 'default',
}

function useInvalider() {
  const queryClient = useQueryClient()
  return () => ['maintenances', 'maintenance', 'pannes', 'bornes', 'borne', 'stats'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }))
}

/** Formulaire de création / modification d'un ordre de travail. */
function OrdreForm({
  ordre,
  initial,
  ouvert,
  onFermer,
}: {
  ordre: Maintenance | null
  initial?: Partial<MaintenanceInput>
  ouvert: boolean
  onFermer: () => void
}) {
  const [form] = Form.useForm()
  const { message } = App.useApp()
  const invalider = useInvalider()
  const type = Form.useWatch('type', form)
  const { data: bornes } = useQuery({ queryKey: ['bornes', {}], queryFn: () => fetchBornes(), enabled: ouvert })
  const { data: techniciens } = useQuery({ queryKey: ['options', 'technicien'], queryFn: () => fetchUserOptions('technicien'), enabled: ouvert })

  useEffect(() => {
    if (!ouvert) return
    form.resetFields()
    const base = ordre ?? { type: 'corrective', priorite: 'normale', ...initial }
    form.setFieldsValue({ ...base, datePrevue: base.datePrevue ? dayjs(base.datePrevue) : dayjs() })
  }, [ouvert, ordre, initial, form])

  const sauvegarde = useMutation({
    mutationFn: (v: MaintenanceInput & { datePrevue?: Dayjs }) => {
      const corps = { ...v, datePrevue: v.datePrevue?.format('YYYY-MM-DD') ?? null }
      return ordre ? updateMaintenance(ordre.id, corps) : createMaintenance(corps)
    },
    onSuccess: (m) => {
      message.success(ordre ? 'Ordre de travail modifié' : `Ordre de travail ${m.reference} créé`)
      invalider()
      onFermer()
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  return (
    <Modal open={ouvert} title={ordre ? `Modifier ${ordre.reference}` : 'Nouvel ordre de travail'} width={640} onCancel={onFermer} onOk={() => form.submit()} confirmLoading={sauvegarde.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => sauvegarde.mutate(v)}>
        <Row gutter={12}>
          <Col span={24}>
            <Form.Item name="borneId" label="Borne" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" disabled={!!ordre} options={(bornes ?? []).map((b) => ({ value: b.id, label: `${b.nom} — ${b.reference}` }))} />
            </Form.Item>
          </Col>
          <Col span={24}><Form.Item name="titre" label="Titre"><Input placeholder="ex. Remplacement module de puissance" /></Form.Item></Col>
          <Col span={8}>
            <Form.Item name="type" label="Type" rules={[{ required: true }]}>
              <Select options={[{ value: 'corrective', label: 'Corrective' }, { value: 'preventive', label: 'Préventive' }]} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="priorite" label="Priorité">
              <Select options={(Object.keys(PRIORITE_LABELS) as PrioriteMaintenance[]).map((p) => ({ value: p, label: PRIORITE_LABELS[p] }))} />
            </Form.Item>
          </Col>
          <Col span={8}><Form.Item name="datePrevue" label="Date prévue"><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={type === 'preventive' ? 14 : 24}>
            <Form.Item name="technicienId" label="Technicien">
              <Select allowClear showSearch optionFilterProp="label" options={(techniciens ?? []).map((t) => ({ value: t.id, label: t.nom }))} />
            </Form.Item>
          </Col>
          {type === 'preventive' && (
            <Col span={10}>
              <Form.Item name="periodiciteJours" label="Récurrence" tooltip="Un nouvel OT est planifié à la clôture">
                <InputNumber min={1} max={730} addonAfter="jours" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          )}
          <Col span={24}><Form.Item name="description" label="Description des travaux" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item></Col>
          {ordre && <Col span={24}><Form.Item name="rapport" label="Rapport d'intervention"><Input.TextArea rows={3} /></Form.Item></Col>}
        </Row>
        <Form.Item name="panneId" hidden><Input /></Form.Item>
      </Form>
    </Modal>
  )
}

/** Détail d'un ordre de travail : statut, pièces, interventions, commentaires, photos. */
function OrdreDrawer({ id, onFermer, onModifier }: { id: number | null; onFermer: () => void; onModifier: (m: Maintenance) => void }) {
  const { peut } = useAuth()
  const ecriture = peut('maintenance', 'ecriture')
  const { message } = App.useApp()
  const invalider = useInvalider()
  const [formPiece] = Form.useForm()
  const [formInter] = Form.useForm()
  const [commentaire, setCommentaire] = useState('')

  const { data: m } = useQuery({ queryKey: ['maintenance', id], queryFn: () => fetchMaintenance(id!), enabled: id !== null })

  const muter = <T,>(fn: (v: T) => Promise<unknown>, succes: string) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        message.success(succes)
        invalider()
      },
      onError: (e) => message.error(errorMessage(e)),
    })

  const statut = muter((s: StatutMaintenance) => updateMaintenance(id!, { statut: s }), 'Statut mis à jour')
  const piece = muter((v: { designation: string; reference?: string; quantite: number; coutUnitaire: number }) => ajouterPiece(id!, v), 'Pièce ajoutée')
  const retraitPiece = muter((pid: number) => supprimerPiece(pid), 'Pièce retirée')
  const intervention = muter(
    (v: { periode: [Dayjs, Dayjs | null]; description: string }) =>
      ajouterIntervention(id!, { debut: v.periode[0].toISOString(), fin: v.periode[1]?.toISOString() ?? null, description: v.description }),
    'Intervention enregistrée',
  )
  const retraitIntervention = muter((iid: number) => supprimerIntervention(iid), 'Intervention supprimée')
  const comment = muter((c: string) => ajouterCommentaire(id!, c), 'Commentaire ajouté')
  const photo = muter((f: File) => ajouterPhoto(id!, f), 'Photo ajoutée')

  return (
    <Drawer open={id !== null} onClose={onFermer} width={760} title={m ? <Space>{m.reference}<Statut valeur={m.statut} libelles={STATUT_MAINTENANCE_LABELS} couleurs={STATUT_MAINTENANCE_COLORS} /></Space> : 'Ordre de travail'}
      extra={m && ecriture && (
        <Space wrap>
          {m.statut === 'planifiee' && <Button icon={<PlayCircleOutlined />} onClick={() => statut.mutate('en_cours')}>Démarrer</Button>}
          {m.statut === 'en_cours' && <Button type="primary" icon={<CheckOutlined />} onClick={() => statut.mutate('terminee')}>Clôturer</Button>}
          {['planifiee', 'en_cours'].includes(m.statut) && <Popconfirm title="Annuler cet ordre de travail ?" onConfirm={() => statut.mutate('annulee')}><Button danger>Annuler</Button></Popconfirm>}
          <Button icon={<EditOutlined />} onClick={() => onModifier(m)} />
        </Space>
      )}
    >
      {m && (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Descriptions size="small" bordered column={2}>
            <Descriptions.Item label="Borne" span={2}><Link to={`/bornes/${m.borneId}`}>{m.borneNom}</Link></Descriptions.Item>
            {m.titre && <Descriptions.Item label="Titre" span={2}>{m.titre}</Descriptions.Item>}
            <Descriptions.Item label="Type">{m.type === 'preventive' ? 'Préventive' : 'Corrective'}{m.periodiciteJours && ` · tous les ${m.periodiciteJours} j`}</Descriptions.Item>
            <Descriptions.Item label="Priorité"><Statut valeur={m.priorite} libelles={PRIORITE_LABELS} couleurs={PRIORITE_COLORS} /></Descriptions.Item>
            <Descriptions.Item label="Technicien">{m.technicienNom ?? 'Non affecté'}</Descriptions.Item>
            <Descriptions.Item label="Date prévue">{formatDate(m.datePrevue, false)}</Descriptions.Item>
            <Descriptions.Item label="Début">{formatDate(m.dateDebut)}</Descriptions.Item>
            <Descriptions.Item label="Fin">{formatDate(m.dateFin)}</Descriptions.Item>
            <Descriptions.Item label="Description" span={2}><span style={{ whiteSpace: 'pre-wrap' }}>{m.description}</span></Descriptions.Item>
            {m.rapport && <Descriptions.Item label="Rapport" span={2}><span style={{ whiteSpace: 'pre-wrap' }}>{m.rapport}</span></Descriptions.Item>}
          </Descriptions>

          <Divider orientation="left" plain>Pièces remplacées · {formatMontant(m.coutPieces)}</Divider>
          <Table size="small" rowKey="id" pagination={false} dataSource={m.pieces}
            columns={[
              { title: 'Désignation', dataIndex: 'designation' },
              { title: 'Réf.', dataIndex: 'reference', render: (r) => r ?? '—' },
              { title: 'Qté', dataIndex: 'quantite', align: 'center' },
              { title: 'Coût', key: 'c', align: 'right', render: (_, p) => formatMontant(p.quantite * p.coutUnitaire) },
              ...(ecriture ? [{ title: '', key: 'x', width: 40, render: (_: unknown, p: { id: number }) => <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => retraitPiece.mutate(p.id)} /> }] : []),
            ]}
          />
          {ecriture && (
            <Form form={formPiece} layout="inline" onFinish={(v) => piece.mutateAsync(v).then(() => formPiece.resetFields())} style={{ rowGap: 8 }}>
              <Form.Item name="designation" rules={[{ required: true, message: '' }]}><Input placeholder="Désignation" style={{ width: 200 }} /></Form.Item>
              <Form.Item name="reference"><Input placeholder="Réf." style={{ width: 100 }} /></Form.Item>
              <Form.Item name="quantite" initialValue={1} rules={[{ required: true }]}><InputNumber min={1} style={{ width: 70 }} /></Form.Item>
              <Form.Item name="coutUnitaire" rules={[{ required: true, message: '' }]}><InputNumber min={0} placeholder="Coût unit." style={{ width: 110 }} /></Form.Item>
              <Button htmlType="submit" icon={<PlusOutlined />}>Ajouter</Button>
            </Form>
          )}

          <Divider orientation="left" plain>Interventions</Divider>
          <List size="small" dataSource={m.interventions} locale={{ emptyText: 'Aucune intervention' }}
            renderItem={(i) => (
              <List.Item actions={ecriture ? [<Button key="x" size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => retraitIntervention.mutate(i.id)} />] : []}>
                <List.Item.Meta
                  avatar={<ToolOutlined style={{ fontSize: 18, color: i.fin ? '#F2A3AA' : '#D9D9E0' }} />}
                  title={<>{formatDate(i.debut)} → {i.fin ? formatDate(i.fin) : <Tag color="warning">en cours</Tag>} <Typography.Text type="secondary">· {i.technicienNom}</Typography.Text></>}
                  description={i.description}
                />
              </List.Item>
            )}
          />
          {ecriture && (
            <Form form={formInter} layout="vertical" onFinish={(v) => intervention.mutateAsync(v).then(() => formInter.resetFields())}>
              <Row gutter={8}>
                <Col span={10}>
                  <Form.Item name="periode" rules={[{ required: true, message: 'Début requis' }]}>
                    <DatePicker.RangePicker showTime={{ format: 'HH:mm' }} format="DD/MM HH:mm" allowEmpty={[false, true]} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={11}><Form.Item name="description" rules={[{ required: true, message: 'Description requise' }]}><Input placeholder="Travaux réalisés" /></Form.Item></Col>
                <Col span={3}><Button htmlType="submit" icon={<PlusOutlined />} block /></Col>
              </Row>
            </Form>
          )}

          <Divider orientation="left" plain>Photos</Divider>
          <Space wrap>
            {(m.photos ?? []).map((p) => <ImageProtegee key={p.id} url={`/admin/documents/${p.id}/telecharger`} alt={p.titre} />)}
            {ecriture && (
              <Upload accept="image/*" showUploadList={false} beforeUpload={(f) => { photo.mutate(f); return false }}>
                <Button icon={<CameraOutlined />} style={{ width: 120, height: 120 }} loading={photo.isPending}>Ajouter</Button>
              </Upload>
            )}
            {!ecriture && !m.photos?.length && <Typography.Text type="secondary">Aucune photo</Typography.Text>}
          </Space>

          <Divider orientation="left" plain>Commentaires</Divider>
          <List size="small" dataSource={m.commentaires} locale={{ emptyText: 'Aucun commentaire' }}
            renderItem={(c) => (
              <List.Item>
                <List.Item.Meta title={<>{c.auteur} <Typography.Text type="secondary" style={{ fontSize: 12 }}>· {formatDate(c.date)}</Typography.Text></>} description={<span style={{ whiteSpace: 'pre-wrap' }}>{c.contenu}</span>} />
              </List.Item>
            )}
          />
          <Space.Compact style={{ width: '100%' }}>
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Ajouter un commentaire…" />
            <Button type="primary" icon={<SendOutlined />} disabled={!commentaire.trim()} onClick={() => comment.mutateAsync(commentaire).then(() => setCommentaire(''))} />
          </Space.Compact>
        </Space>
      )}
    </Drawer>
  )
}

function Pannes({ onCreerOrdre }: { onCreerOrdre: (p: Panne) => void }) {
  const { peut } = useAuth()
  const ecriture = peut('maintenance', 'ecriture')
  const { message } = App.useApp()
  const invalider = useInvalider()
  const [form] = Form.useForm()
  const [statut, setStatut] = useState<string>('ouverte,en_cours')
  const [ouvert, setOuvert] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['pannes', statut], queryFn: () => fetchPannes({ statut }) })
  const { data: bornes } = useQuery({ queryKey: ['bornes', {}], queryFn: () => fetchBornes(), enabled: ouvert })

  const declaration = useMutation({
    mutationFn: createPanne,
    onSuccess: () => {
      message.success('Panne déclarée')
      setOuvert(false)
      form.resetFields()
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const resolution = useMutation({
    mutationFn: (id: number) => updatePanne(id, { statut: 'resolue' }),
    onSuccess: () => {
      message.success('Panne résolue')
      invalider()
    },
  })

  const colonnes: ColumnsType<Panne> = [
    { title: 'Signalée', dataIndex: 'createdAt', render: (d, p) => <>{formatDate(d)}<div style={{ fontSize: 12, color: 'var(--texte-doux)' }}>{p.signaleParNom}</div></> },
    { title: 'Borne', dataIndex: 'borneNom', render: (n, p) => <Link to={`/bornes/${p.borneId}`}>{n}</Link> },
    { title: 'Type', dataIndex: 'type', render: (t) => TYPE_PANNE_LABELS[t] ?? t },
    { title: 'Gravité', dataIndex: 'gravite', render: (g) => <Statut valeur={g} libelles={GRAVITE_PANNE_LABELS} couleurs={GRAVITE_PANNE_COLORS} /> },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    { title: 'Ordres de travail', dataIndex: 'ordresTravail', render: (ots: Panne['ordresTravail']) => ots?.map((o) => <Tag key={o.id}>{o.reference}</Tag>) },
    { title: 'Statut', dataIndex: 'statut', render: (s) => <Statut valeur={s} libelles={STATUT_PANNE_LABELS} couleurs={STATUT_PANNE_COLORS} /> },
    {
      title: '',
      key: 'a',
      width: 170,
      render: (_, p) =>
        ecriture && p.statut !== 'resolue' && (
          <Space size={4}>
            <Button size="small" onClick={() => onCreerOrdre(p)}>Créer un OT</Button>
            <Popconfirm title="Marquer la panne comme résolue ?" onConfirm={() => resolution.mutate(p.id)}>
              <Button size="small" icon={<CheckOutlined />} />
            </Popconfirm>
          </Space>
        ),
    },
  ]

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented value={statut} onChange={(v) => setStatut(String(v))} options={[{ label: 'Ouvertes', value: 'ouverte,en_cours' }, { label: 'Résolues', value: 'resolue' }, { label: 'Toutes', value: '' }]} />
        {peut('alertes', 'ecriture') && <Button icon={<PlusOutlined />} onClick={() => setOuvert(true)}>Déclarer une panne</Button>}
      </Space>
      <Table rowKey="id" size="middle" columns={colonnes} dataSource={data} loading={isLoading} pagination={{ pageSize: 15, hideOnSinglePage: true }} scroll={{ x: 1000 }} />
      <Modal open={ouvert} title="Déclarer une panne" onCancel={() => setOuvert(false)} onOk={() => form.submit()} confirmLoading={declaration.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(v) => declaration.mutate(v)} initialValues={{ gravite: 'moyenne', type: 'electrique' }}>
          <Form.Item name="borneId" label="Borne" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(bornes ?? []).map((b) => ({ value: b.id, label: b.nom }))} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="type" label="Type"><Select options={Object.entries(TYPE_PANNE_LABELS).map(([value, label]) => ({ value, label }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="gravite" label="Gravité"><Select options={Object.entries(GRAVITE_PANNE_LABELS).map(([value, label]) => ({ value, label }))} /></Form.Item></Col>
          </Row>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Une panne élevée ou critique passe la borne en défaut.</Typography.Text>
        </Form>
      </Modal>
    </>
  )
}

/** Module 11 — maintenance : planification, ordres de travail, pannes, historique. */
export default function MaintenancePage() {
  const { peut, user } = useAuth()
  const ecriture = peut('maintenance', 'ecriture')
  const { message } = App.useApp()
  const invalider = useInvalider()
  const [params, setParams] = useSearchParams()
  const [statut, setStatut] = useState<string>()
  const [mesOrdres, setMesOrdres] = useState(user?.role === 'technicien')
  const [detail, setDetail] = useState<number | null>(params.get('ot') ? Number(params.get('ot')) : null)
  const [form, setForm] = useState<{ ouvert: boolean; ordre: Maintenance | null; initial?: Partial<MaintenanceInput> }>({ ouvert: false, ordre: null })

  useEffect(() => {
    const borne = params.get('borne')
    if (borne) {
      setForm({ ouvert: true, ordre: null, initial: { borneId: Number(borne) } })
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const filtres = { statut, technicien_id: mesOrdres ? user?.id : undefined, tous: mesOrdres ? undefined : 1 }
  const { data: ordres, isLoading } = useQuery({ queryKey: ['maintenances', filtres], queryFn: () => fetchMaintenances(filtres) })

  const suppression = useMutation({
    mutationFn: deleteMaintenance,
    onSuccess: () => {
      message.success('Ordre de travail supprimé')
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const parJour = useMemo(() => {
    const index = new Map<string, Maintenance[]>()
    ;(ordres ?? []).forEach((o) => {
      if (!o.datePrevue) return
      index.set(o.datePrevue, [...(index.get(o.datePrevue) ?? []), o])
    })
    return index
  }, [ordres])

  const compte = (s: StatutMaintenance) => (ordres ?? []).filter((o) => o.statut === s).length
  const enRetard = (ordres ?? []).filter((o) => o.statut === 'planifiee' && o.datePrevue && dayjs(o.datePrevue).isBefore(dayjs(), 'day')).length

  const colonnes: ColumnsType<Maintenance> = [
    { title: 'OT', dataIndex: 'reference', render: (r, o) => <a onClick={() => setDetail(o.id)} className="texte-mono">{r}</a> },
    { title: 'Borne', dataIndex: 'borneNom', render: (n, o) => <Link to={`/bornes/${o.borneId}`}>{n}</Link> },
    { title: 'Intitulé', key: 't', ellipsis: true, render: (_, o) => o.titre ?? o.description },
    { title: 'Type', dataIndex: 'type', responsive: ['md'], render: (t) => (t === 'preventive' ? <Tag color="processing">Préventive</Tag> : <Tag color="error">Corrective</Tag>) },
    { title: 'Priorité', dataIndex: 'priorite', render: (p) => <Statut valeur={p} libelles={PRIORITE_LABELS} couleurs={PRIORITE_COLORS} /> },
    { title: 'Technicien', dataIndex: 'technicienNom', responsive: ['lg'], render: (n) => n ?? <Typography.Text type="secondary">Non affecté</Typography.Text> },
    {
      title: 'Prévue le',
      dataIndex: 'datePrevue',
      sorter: (a, b) => (a.datePrevue ?? '').localeCompare(b.datePrevue ?? ''),
      render: (d, o) => <Typography.Text type={o.statut === 'planifiee' && d && dayjs(d).isBefore(dayjs(), 'day') ? 'danger' : undefined}>{formatDate(d, false)}</Typography.Text>,
    },
    { title: 'Coût pièces', dataIndex: 'coutPieces', responsive: ['xl'], render: (c) => formatMontant(c) },
    { title: 'Statut', dataIndex: 'statut', render: (s) => <Statut valeur={s} libelles={STATUT_MAINTENANCE_LABELS} couleurs={STATUT_MAINTENANCE_COLORS} /> },
    {
      title: '',
      key: 'a',
      width: 50,
      render: (_, o) => ecriture && o.statut !== 'en_cours' && (
        <Popconfirm title="Supprimer cet ordre de travail ?" onConfirm={() => suppression.mutate(o.id)}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div className="pile">
      <EnTete
        titre="Maintenance"
        actions={
          <>
            <Segmented value={mesOrdres ? 'moi' : 'tous'} onChange={(v) => setMesOrdres(v === 'moi')} options={[{ label: 'Tous les OT', value: 'tous' }, { label: 'Mes OT', value: 'moi' }]} />
            {ecriture && <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ ouvert: true, ordre: null })}>Nouvel ordre de travail</Button>}
          </>
        }
      />
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Kpi titre="Planifiés" valeur={compte('planifiee')} couleur="#E5545F" /></Col>
        <Col xs={12} md={6}><Kpi titre="En cours" valeur={compte('en_cours')} couleur="#D9D9E0" /></Col>
        <Col xs={12} md={6}><Kpi titre="En retard" valeur={enRetard} couleur="#FF6B6B" /></Col>
        <Col xs={12} md={6}><Kpi titre="Terminés" valeur={compte('terminee')} couleur="#F2A3AA" /></Col>
      </Row>
      <Card size="small">
        <Tabs
          items={[
            {
              key: 'planning',
              label: 'Planning',
              children: (
                <Calendar
                  cellRender={(date, info) => {
                    if (info.type !== 'date') return info.originNode
                    const jour = (parJour.get(date.format('YYYY-MM-DD')) ?? [])
                    return (
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {jour.map((o) => (
                          <li key={o.id} onClick={() => setDetail(o.id)} style={{ cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <Badge status={COULEUR_CALENDRIER[o.statut]} text={<span style={{ fontSize: 12 }}>{o.borneNom}</span>} />
                          </li>
                        ))}
                      </ul>
                    )
                  }}
                />
              ),
            },
            {
              key: 'ordres',
              label: 'Ordres de travail',
              children: (
                <>
                  <Select allowClear placeholder="Statut" style={{ width: 180, marginBottom: 12 }} value={statut} onChange={setStatut}
                    options={(Object.keys(STATUT_MAINTENANCE_LABELS) as StatutMaintenance[]).map((s) => ({ value: s, label: STATUT_MAINTENANCE_LABELS[s] }))} />
                  <Table rowKey="id" size="middle" columns={colonnes} dataSource={ordres} loading={isLoading} pagination={{ pageSize: 20, hideOnSinglePage: true }}
                    onRow={(o) => ({ onDoubleClick: () => setDetail(o.id) })} scroll={{ x: 1000 }} locale={{ emptyText: <Empty description="Aucun ordre de travail" /> }} />
                </>
              ),
            },
            {
              key: 'pannes',
              label: 'Pannes',
              children: (
                <Pannes
                  onCreerOrdre={(p) =>
                    setForm({
                      ouvert: true,
                      ordre: null,
                      initial: { borneId: p.borneId, panneId: p.id, type: 'corrective', priorite: p.gravite === 'critique' ? 'urgente' : p.gravite === 'elevee' ? 'haute' : 'normale', description: p.description },
                    })
                  }
                />
              ),
            },
          ]}
        />
      </Card>
      <OrdreForm ordre={form.ordre} initial={form.initial} ouvert={form.ouvert} onFermer={() => setForm({ ouvert: false, ordre: null })} />
      <OrdreDrawer id={detail} onFermer={() => setDetail(null)} onModifier={(m) => setForm({ ouvert: true, ordre: m })} />
    </div>
  )
}
