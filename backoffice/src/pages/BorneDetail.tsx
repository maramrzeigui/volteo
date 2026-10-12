import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Avatar,
  Alert,
  App,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Result,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import {
  ArrowLeftOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  FileSearchOutlined,
  PlusOutlined,
  PoweroffOutlined,
  KeyOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  StopOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
  CameraOutlined,
  PrinterOutlined,
  MailOutlined,
  PhoneOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  commandeBorne,
  genererMotDePasseOcpp,
  supprimerPhotoBorne,
  televerserPhotoBorne,
  createConnecteur,
  deleteConnecteur,
  deployerFirmware,
  errorMessage,
  fetchAlertes,
  fetchBorne,
  fetchDeploiements,
  fetchFirmwares,
  fetchHistoriqueBorne,
  fetchMaintenances,
  updateConnecteur,
} from '../api'
import { useAuth } from '../auth'
import BorneForm from '../components/BorneForm'
import CarteBornes from '../components/CarteBornes'
import DocumentsPanel from '../components/DocumentsPanel'
import SessionsTable from '../components/SessionsTable'
import { EnTete, Kpi, Statut } from '../components/commun'
import { EtiquetteBorne, ModaleEtiquette } from '../components/EtiquetteBorne'
import {
  ETAT_BORNE_COLORS,
  ETAT_BORNE_LABELS,
  ETAT_CONNECTEUR_COLORS,
  ETAT_CONNECTEUR_LABELS,
  GRAVITE_COLORS,
  GRAVITE_LABELS,
  PRIORITE_COLORS,
  PRIORITE_LABELS,
  STATUT_DEPLOIEMENT_COLORS,
  STATUT_DEPLOIEMENT_LABELS,
  STATUT_MAINTENANCE_COLORS,
  STATUT_MAINTENANCE_LABELS,
  TYPE_ALERTE_LABELS,
  formatDate,
  formatEnergie,
  formatMontant,
  formatRelatif,
} from '../format'
import type { Borne, ContactResponsable, CommandeOcpp, Connecteur, EtatConnecteur, TypeConnecteur } from '../types'

const TYPES: TypeConnecteur[] = ['CCS', 'Type2', 'CHAdeMO', 'AC', 'DC']
const CLES_OCPP = ['HeartbeatInterval', 'MeterValueSampleInterval', 'ConnectionTimeOut', 'LocalAuthorizeOffline', 'AuthorizeRemoteTxRequests', 'NumberOfConnectors']

const COULEUR_HISTORIQUE: Record<string, string> = {
  session: 'processing',
  alerte: 'error',
  maintenance: 'warning',
  firmware: 'default',
  action: 'gray',
}

function Connecteurs({ borne, ecriture }: { borne: Borne; ecriture: boolean }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [edition, setEdition] = useState<Connecteur | 'nouveau' | null>(null)
  const [form] = Form.useForm()
  const invalider = () => queryClient.invalidateQueries({ queryKey: ['borne', borne.id] })

  const sauvegarde = useMutation({
    mutationFn: (v: { type: string; puissanceKw: number; etat?: string }) =>
      edition === 'nouveau' ? createConnecteur(borne.id, v) : updateConnecteur((edition as Connecteur).id, v),
    onSuccess: () => {
      message.success('Connecteur enregistré')
      setEdition(null)
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const suppression = useMutation({
    mutationFn: deleteConnecteur,
    onSuccess: (r) => {
      message.success(r.message)
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  return (
    <>
      {ecriture && (
        <Button icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => { form.setFieldsValue({ type: 'Type2', puissanceKw: 22, etat: 'disponible' }); setEdition('nouveau') }}>
          Ajouter un connecteur
        </Button>
      )}
      <Row gutter={[12, 12]}>
        {borne.connecteurs.map((c) => (
          <Col xs={24} sm={12} lg={8} key={c.id}>
            <div className="connecteur-carte">
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Space>
                  <ThunderboltOutlined style={{ fontSize: 22, color: '#E5545F' }} />
                  <div>
                    <Typography.Text strong>Prise {c.numero} · {c.type}</Typography.Text>
                    <div style={{ fontSize: 12, color: 'var(--texte-doux)' }}>{c.courant} · {c.puissanceKw} kW</div>
                  </div>
                </Space>
                <Statut valeur={c.etat} libelles={ETAT_CONNECTEUR_LABELS} couleurs={ETAT_CONNECTEUR_COLORS} />
              </Space>
              {ecriture && (
                <Space style={{ marginTop: 10 }}>
                  <Button size="small" icon={<EditOutlined />} onClick={() => { form.setFieldsValue(c); setEdition(c) }}>Modifier</Button>
                  <Popconfirm title="Retirer ce connecteur ?" description="S'il a un historique, il sera mis hors service." onConfirm={() => suppression.mutate(c.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              )}
            </div>
          </Col>
        ))}
      </Row>
      <Modal open={edition !== null} title={edition === 'nouveau' ? 'Nouveau connecteur' : 'Modifier le connecteur'} onCancel={() => setEdition(null)} onOk={() => form.submit()} confirmLoading={sauvegarde.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(v) => sauvegarde.mutate(v)}>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}><Select options={TYPES.map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item name="puissanceKw" label="Puissance" rules={[{ required: true }]}><InputNumber min={1} max={400} addonAfter="kW" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="etat" label="État / disponibilité">
            <Select options={(Object.keys(ETAT_CONNECTEUR_LABELS) as EtatConnecteur[]).map((e) => ({ value: e, label: ETAT_CONNECTEUR_LABELS[e] }))} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

/** OCPP 1.6 Security Profile 1 : identifiants HTTP Basic que la borne présente à la connexion. */
function SecuriteOcpp({ borne }: { borne: Borne }) {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()

  const generation = useMutation({
    mutationFn: () => genererMotDePasseOcpp(borne.id),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['borne', borne.id] })
      modal.success({
        title: 'Nouveau mot de passe OCPP',
        width: 560,
        content: (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Alert type="warning" showIcon message="Notez-le maintenant : il ne sera plus jamais affiché. L'ancien mot de passe ne fonctionne plus." />
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="URL de supervision"><Typography.Text copyable className="texte-mono">{r.url}</Typography.Text></Descriptions.Item>
              <Descriptions.Item label="Identifiant"><Typography.Text copyable className="texte-mono">{r.identifiant}</Typography.Text></Descriptions.Item>
              <Descriptions.Item label="Mot de passe"><Typography.Text copyable className="texte-mono">{r.motDePasse}</Typography.Text></Descriptions.Item>
            </Descriptions>
          </Space>
        ),
      })
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  return (
    <Card
      size="small"
      title={<Space><SafetyCertificateOutlined />Sécurité de la connexion OCPP</Space>}
      extra={
        <Popconfirm
          title="Générer un nouveau mot de passe ?"
          description="La borne devra être reconfigurée : elle sera refusée à sa prochaine connexion."
          okText="Générer"
          onConfirm={() => generation.mutate()}
        >
          <Button size="small" icon={<KeyOutlined />} loading={generation.isPending}>Nouveau mot de passe</Button>
        </Popconfirm>
      }
    >
      <Space wrap size={[16, 8]}>
        {borne.ocppSecurise
          ? <Tag color="success">Mot de passe configuré (Security Profile 1)</Tag>
          : <Tag color="error">Aucun mot de passe : la borne sera refusée</Tag>}
        <Typography.Text type="secondary">Identifiant HTTP Basic : <span className="texte-mono">{borne.reference}</span></Typography.Text>
        {borne.etat === 'deconnectee' && borne.deconnecteeLe && (
          <Typography.Text type="danger">Connexion perdue {formatRelatif(borne.deconnecteeLe)}</Typography.Text>
        )}
      </Space>
    </Card>
  )
}

/** Photo de la borne montrée aux conducteurs dans l'application mobile. */
/** Admin (exploitant) et technicien responsables de la borne, avec leurs coordonnées. */
function ResponsablesBorne({ borne }: { borne: Borne }) {
  const r = borne.responsables
  if (!r) return null
  const ligne = (role: string, c: ContactResponsable | null) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0' }}>
      <Avatar style={{ background: '#B83A46', flexShrink: 0 }}>{c ? c.nom.split(' ').map((m) => m[0]).slice(0, 2).join('') : '?'}</Avatar>
      <div style={{ minWidth: 0 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{role}</Typography.Text>
        {c ? (
          <>
            <div><Typography.Text strong>{c.nom}</Typography.Text>{c.actif === false && <Tag style={{ marginLeft: 8 }}>désactivé</Tag>}</div>
            <div><MailOutlined /> <a href={`mailto:${c.email}`}>{c.email}</a></div>
            {c.telephone && <div><PhoneOutlined /> <a href={`tel:${c.telephone.replace(/\s/g, '')}`}>{c.telephone}</a></div>}
          </>
        ) : <div><Typography.Text type="secondary">Non attribué — modifiez la borne pour en choisir un.</Typography.Text></div>}
      </div>
    </div>
  )
  return (
    <Card size="small" title={<Space><TeamOutlined />Responsables</Space>}>
      {ligne('Admin de la borne', r.admin)}
      {ligne('Technicien', r.technicien)}
    </Card>
  )
}

function PhotoBorne({ borne }: { borne: Borne }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const succes = (texte: string) => {
    queryClient.invalidateQueries({ queryKey: ['borne', borne.id] })
    message.success(texte)
  }
  const envoi = useMutation({
    mutationFn: (f: File) => televerserPhotoBorne(borne.id, f),
    onSuccess: () => succes('Photo mise à jour'),
    onError: (e) => message.error(errorMessage(e)),
  })
  const suppression = useMutation({
    mutationFn: () => supprimerPhotoBorne(borne.id),
    onSuccess: () => succes('Photo supprimée'),
    onError: (e) => message.error(errorMessage(e)),
  })

  return (
    <Card
      size="small"
      title={<Space><CameraOutlined />Photo dans l’application</Space>}
      extra={
        <Space>
          {borne.photoUrl && (
            <Popconfirm title="Supprimer la photo ?" okText="Supprimer" onConfirm={() => suppression.mutate()}>
              <Button size="small" danger icon={<DeleteOutlined />} loading={suppression.isPending} />
            </Popconfirm>
          )}
          <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} beforeUpload={(f) => { envoi.mutate(f); return false }}>
            <Button size="small" icon={<CameraOutlined />} loading={envoi.isPending}>{borne.photoUrl ? 'Changer' : 'Ajouter une photo'}</Button>
          </Upload>
        </Space>
      }
    >
      {borne.photoUrl
        ? <img src={borne.photoUrl} alt={`Borne ${borne.nom}`} style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 8 }} />
        : <Typography.Text type="secondary">Aucune photo : l’application affiche une illustration. Format paysage conseillé (au moins 1200 × 800, 5 Mo max).</Typography.Text>}
    </Card>
  )
}

function CommandesOcpp({ borne }: { borne: Borne }) {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [configuration, setConfiguration] = useState<{ key: string; value: string; readonly: boolean }[] | null>(null)
  const [connecteur, setConnecteur] = useState<number | undefined>(borne.connecteurs[0]?.id)
  const [form] = Form.useForm()

  const envoi = useMutation({
    mutationFn: ({ commande, options }: { commande: CommandeOcpp; options?: Record<string, unknown> }) => commandeBorne(borne.id, commande, options),
    onSuccess: (r, { commande }) => {
      message.success(r.message)
      if (commande === 'get_configuration' && r.donnees) setConfiguration(r.donnees)
      queryClient.invalidateQueries({ queryKey: ['borne', borne.id] })
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const confirmer = (titre: string, contenu: string, commande: CommandeOcpp, options?: Record<string, unknown>) =>
    modal.confirm({ title: titre, content: contenu, okText: 'Envoyer', onOk: () => envoi.mutateAsync({ commande, options }) })

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {!borne.enLigne && <Alert type="warning" showIcon message="La borne semble hors ligne : les commandes risquent de ne pas être transmises." />}
      <SecuriteOcpp borne={borne} />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card size="small" title="Redémarrage & connecteurs">
            <Space wrap>
              <Button icon={<PoweroffOutlined />} onClick={() => confirmer('Reset logiciel ?', 'OCPP Reset (Soft) : redémarrage applicatif de la borne.', 'reset')}>Reset logiciel</Button>
              <Button danger icon={<PoweroffOutlined />} onClick={() => confirmer('Reset matériel ?', 'OCPP Reset (Hard) : redémarrage complet, les recharges en cours sont interrompues.', 'reset_hard')}>Reset matériel</Button>
              <Button icon={<StopOutlined />} onClick={() => confirmer('Arrêter les recharges ?', 'RemoteStopTransaction sur toutes les sessions en cours de cette borne.', 'remote_stop')}>Arrêter les recharges</Button>
            </Space>
            <Space.Compact style={{ marginTop: 12, width: '100%' }}>
              <Select value={connecteur} onChange={setConnecteur} style={{ flex: 1 }} options={borne.connecteurs.map((c) => ({ value: c.id, label: `Prise ${c.numero} — ${c.type}` }))} />
              <Button icon={<UnlockOutlined />} onClick={() => envoi.mutate({ commande: 'unlock', options: { connecteurId: connecteur } })}>Déverrouiller</Button>
            </Space.Compact>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title="Diagnostics">
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
              GetDiagnostics : la borne dépose son journal sur la plateforme ; il apparaît dans l’onglet Documents.
            </Typography.Paragraph>
            <Button icon={<FileSearchOutlined />} loading={envoi.isPending} onClick={() => envoi.mutate({ commande: 'get_diagnostics' })}>Demander les diagnostics</Button>
          </Card>
        </Col>
      </Row>
      <Card
        size="small"
        title="Configuration OCPP"
        extra={<Button size="small" icon={<CloudDownloadOutlined />} onClick={() => envoi.mutate({ commande: 'get_configuration' })}>Lire la configuration</Button>}
      >
        <Form form={form} layout="inline" onFinish={(v) => confirmer(`Modifier ${v.cle} ?`, `ChangeConfiguration ${v.cle} = ${v.valeur}`, 'change_configuration', v)}>
          <Form.Item name="cle" rules={[{ required: true }]}>
            <Select showSearch placeholder="Clé" style={{ width: 240 }} options={CLES_OCPP.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="valeur" rules={[{ required: true }]}>
            <Input placeholder="Valeur" style={{ width: 160 }} />
          </Form.Item>
          <Button htmlType="submit" type="primary" icon={<SettingOutlined />}>ChangeConfiguration</Button>
        </Form>
        {configuration && (
          <Table
            style={{ marginTop: 16 }}
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={configuration}
            columns={[
              { title: 'Clé', dataIndex: 'key', render: (k) => <span className="texte-mono">{k}</span> },
              { title: 'Valeur', dataIndex: 'value' },
              { title: 'Accès', dataIndex: 'readonly', render: (r) => (r ? <Tag>Lecture seule</Tag> : <Tag color="success">Modifiable</Tag>) },
            ]}
            onRow={(r) => ({ onClick: () => !r.readonly && form.setFieldsValue({ cle: r.key, valeur: r.value }), className: 'ligne-cliquable' })}
          />
        )}
      </Card>
    </Space>
  )
}

function FirmwareBorne({ borne, ecriture }: { borne: Borne; ecriture: boolean }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [choix, setChoix] = useState<number>()
  const { data: deploiements } = useQuery({ queryKey: ['deploiements', { borne_id: borne.id }], queryFn: () => fetchDeploiements({ borne_id: borne.id }), refetchInterval: 10_000 })
  const { data: firmwares } = useQuery({ queryKey: ['firmwares'], queryFn: fetchFirmwares, enabled: ecriture })

  const deploiement = useMutation({
    mutationFn: (id: number) => deployerFirmware(id, [borne.id]),
    onSuccess: (r) => {
      message.info(r.message)
      queryClient.invalidateQueries({ queryKey: ['deploiements'] })
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Space wrap>
        <Typography.Text>Version installée : <Tag color="processing">{borne.versionFirmware}</Tag></Typography.Text>
        {ecriture && (
          <Space.Compact>
            <Select placeholder="Choisir un firmware" style={{ width: 260 }} value={choix} onChange={setChoix}
              options={(firmwares ?? []).map((f) => ({ value: f.id, label: `${f.version} — ${f.fabricant ?? ''} ${f.modele ?? ''}` }))} />
            <Button type="primary" disabled={!choix} loading={deploiement.isPending} onClick={() => choix && deploiement.mutate(choix)}>Déployer</Button>
          </Space.Compact>
        )}
      </Space>
      <Table
        rowKey="id"
        size="small"
        dataSource={deploiements}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        columns={[
          { title: 'Date', dataIndex: 'createdAt', render: (d) => formatDate(d) },
          { title: 'Version', dataIndex: 'version', render: (v, d) => <>{d.versionPrecedente ?? '?'} → <strong>{v}</strong>{d.rollback && <Tag color="default" style={{ marginLeft: 6 }}>Rollback</Tag>}</> },
          { title: 'Statut', dataIndex: 'statut', render: (s) => <Statut valeur={s} libelles={STATUT_DEPLOIEMENT_LABELS} couleurs={STATUT_DEPLOIEMENT_COLORS} /> },
          { title: 'Message', dataIndex: 'message', responsive: ['md'] },
          { title: 'Par', dataIndex: 'lanceParNom', responsive: ['lg'] },
        ]}
      />
    </Space>
  )
}

/** Fiche borne (interface « Détail borne »). */
export default function BorneDetailPage() {
  const { id } = useParams()
  const borneId = Number(id)
  const { peut } = useAuth()
  const navigate = useNavigate()
  const [edition, setEdition] = useState(false)
  const [etiquette, setEtiquette] = useState(false)

  const { data, isLoading, isError } = useQuery({ queryKey: ['borne', borneId], queryFn: () => fetchBorne(borneId), refetchInterval: 20_000 })
  const { data: historique } = useQuery({ queryKey: ['borne', borneId, 'historique'], queryFn: () => fetchHistoriqueBorne(borneId) })
  const { data: alertes } = useQuery({ queryKey: ['alertes', { borne_id: borneId }], queryFn: () => fetchAlertes({ borne_id: borneId }), enabled: peut('alertes') })
  const { data: maintenances } = useQuery({ queryKey: ['maintenances', { borne_id: borneId }], queryFn: () => fetchMaintenances({ borne_id: borneId, tous: 1 }), enabled: peut('maintenance') })

  if (isLoading) return <Spin style={{ display: 'block', margin: 80 }} />
  if (isError || !data) return <Result status="404" title="Borne introuvable" extra={<Button onClick={() => navigate('/bornes')}>Retour</Button>} />

  const { borne, stats } = data
  const ecriture = peut('bornes', 'ecriture')

  const onglets = [
    {
      key: 'apercu',
      label: "Vue d'ensemble",
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={16}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Row gutter={[12, 12]}>
                <Col xs={12} md={6}><Kpi titre="Sessions (30 j)" valeur={stats.sessions30j} /></Col>
                <Col xs={12} md={6}><Kpi titre="Énergie (30 j)" valeur={formatEnergie(stats.kwh30j)} /></Col>
                <Col xs={12} md={6}><Kpi titre="CA (30 j)" valeur={formatMontant(stats.ca30j)} /></Col>
                <Col xs={12} md={6}><Kpi titre="Taux d'occupation" valeur={stats.tauxOccupation} suffixe="%" /></Col>
              </Row>
              {data.sessionsEnCours.length > 0 && (
                <Alert
                  type="info"
                  showIcon
                  message={`${data.sessionsEnCours.length} recharge(s) en cours`}
                  description={data.sessionsEnCours.map((s) => (
                    <div key={s.id}>
                      #{s.id} · {s.userNom} · {s.typeConnecteur} · {formatEnergie(s.energieKwh)} · {s.puissanceInstantaneeKw ?? 0} kW
                      {s.pourcentageBatterie !== null && ` · ${s.pourcentageBatterie} %`}
                    </div>
                  ))}
                />
              )}
              {borne.source !== 'publique' && <ResponsablesBorne borne={borne} />}
              {borne.source !== 'publique' && <PhotoBorne borne={borne} />}
              <Descriptions bordered size="small" column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }}>
                <Descriptions.Item label="Référence OCPP"><span className="texte-mono">{borne.reference}</span></Descriptions.Item>
                <Descriptions.Item label="N° de série">{borne.numeroSerie}</Descriptions.Item>
                <Descriptions.Item label="Fabricant / modèle">{borne.fabricant} {borne.modele}</Descriptions.Item>
                <Descriptions.Item label="Puissance">{borne.puissanceKw} kW</Descriptions.Item>
                <Descriptions.Item label="Firmware">{borne.versionFirmware}</Descriptions.Item>
                <Descriptions.Item label="OCPP">{borne.versionOcpp}</Descriptions.Item>
                <Descriptions.Item label="Adresse" span={2}>{borne.adresse}{borne.site && <Tag style={{ marginLeft: 8 }}>{borne.site}</Tag>}</Descriptions.Item>
                <Descriptions.Item label="Coordonnées GPS">{borne.latitude}, {borne.longitude}</Descriptions.Item>
                <Descriptions.Item label="Température">{borne.temperatureC !== null ? `${borne.temperatureC} °C` : '—'}</Descriptions.Item>
                <Descriptions.Item label="Dernier heartbeat">{formatDate(borne.dernierHeartbeat)} ({formatRelatif(borne.dernierHeartbeat)})</Descriptions.Item>
                <Descriptions.Item label="Tarif">{borne.tarifLibelle}</Descriptions.Item>
                <Descriptions.Item label="Exploitant">{borne.exploitantNom ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Technicien référent">{borne.technicienNom ?? '—'}</Descriptions.Item>
              </Descriptions>
            </Space>
          </Col>
          <Col xs={24} xl={8}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card size="small" styles={{ body: { padding: 8 } }}>
                <CarteBornes points={[borne]} hauteur={220} />
              </Card>
              <Card size="small" title="QR code de la borne" extra={<Button size="small" icon={<PrinterOutlined />} onClick={() => setEtiquette(true)}>Imprimer</Button>}
                styles={{ body: { display: 'grid', justifyItems: 'center' } }}>
                <div className="etiquette-apercu"><EtiquetteBorne borne={borne} /></div>
              </Card>
              <ModaleEtiquette borne={etiquette ? borne : null} onFermer={() => setEtiquette(false)} />
            </Space>
          </Col>
        </Row>
      ),
    },
    { key: 'connecteurs', label: `Connecteurs (${borne.connecteurs.length})`, children: <Connecteurs borne={borne} ecriture={ecriture} /> },
    ...(peut('supervision', 'ecriture') ? [{ key: 'ocpp', label: 'Commandes OCPP', children: <CommandesOcpp borne={borne} /> }] : []),
    ...(peut('sessions') ? [{ key: 'sessions', label: 'Sessions', children: <SessionsTable filtresFixes={{ borne_id: borne.id }} /> }] : []),
    ...(peut('maintenance')
      ? [{
          key: 'maintenance',
          label: 'Maintenance',
          children: (
            <List
              dataSource={maintenances}
              locale={{ emptyText: <Empty description="Aucun ordre de travail" /> }}
              header={peut('maintenance', 'ecriture') && <Button icon={<PlusOutlined />} onClick={() => navigate(`/maintenance?borne=${borne.id}`)}>Nouvel ordre de travail</Button>}
              renderItem={(m) => (
                <List.Item actions={[<Link key="o" to={`/maintenance?ot=${m.id}`}>Ouvrir</Link>]}>
                  <List.Item.Meta
                    title={<Space wrap><span className="texte-mono">{m.reference}</span>{m.titre ?? m.description.slice(0, 60)}<Statut valeur={m.statut} libelles={STATUT_MAINTENANCE_LABELS} couleurs={STATUT_MAINTENANCE_COLORS} /><Statut valeur={m.priorite} libelles={PRIORITE_LABELS} couleurs={PRIORITE_COLORS} /></Space>}
                    description={`${m.type === 'preventive' ? 'Préventive' : 'Corrective'} · prévue le ${formatDate(m.datePrevue, false)} · ${m.technicienNom ?? 'non affecté'}`}
                  />
                </List.Item>
              )}
            />
          ),
        }]
      : []),
    ...(peut('alertes')
      ? [{
          key: 'alertes',
          label: <Badge count={borne.alertesOuvertes} size="small" offset={[8, 0]}>Alertes</Badge>,
          children: (
            <Table
              rowKey="id"
              size="small"
              dataSource={alertes}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              columns={[
                { title: 'Date', dataIndex: 'createdAt', render: (d) => formatDate(d) },
                { title: 'Type', dataIndex: 'type', render: (t) => TYPE_ALERTE_LABELS[t] ?? t },
                { title: 'Gravité', dataIndex: 'gravite', render: (g) => <Statut valeur={g} libelles={GRAVITE_LABELS} couleurs={GRAVITE_COLORS} /> },
                { title: 'Message', dataIndex: 'message' },
                { title: 'Statut', dataIndex: 'resolue', render: (r) => (r ? <Tag color="success">Résolue</Tag> : <Tag color="error">Ouverte</Tag>) },
              ]}
            />
          ),
        }]
      : []),
    ...(peut('firmware') ? [{ key: 'firmware', label: 'Firmware', children: <FirmwareBorne borne={borne} ecriture={peut('firmware', 'ecriture')} /> }] : []),
    ...(peut('documents') ? [{ key: 'documents', label: 'Documents', children: <DocumentsPanel borneId={borne.id} /> }] : []),
    {
      key: 'historique',
      label: 'Historique',
      children: historique?.length ? (
        <Timeline
          style={{ marginTop: 8 }}
          items={historique.map((h) => ({
            color: COULEUR_HISTORIQUE[h.categorie],
            children: (
              <>
                <Typography.Text strong>{h.titre}</Typography.Text>
                <div style={{ fontSize: 12, color: 'var(--texte-doux)' }}>
                  {formatDate(h.date)} · {h.categorie}
                  {h.details && ` · ${h.details.length > 160 ? `${h.details.slice(0, 160)}…` : h.details}`}
                </div>
              </>
            ),
          }))}
        />
      ) : (
        <Empty />
      ),
    },
  ]

  return (
    <div className="pile">
      <EnTete
        titre={
          <Space wrap>
            <Tooltip title="Retour"><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} /></Tooltip>
            {borne.nom}
            <Statut valeur={borne.etat} libelles={ETAT_BORNE_LABELS} couleurs={ETAT_BORNE_COLORS} />
            <Badge status={borne.enLigne ? 'success' : 'error'} text={borne.enLigne ? 'En ligne' : 'Hors ligne'} />
          </Space>
        }
        sousTitre={borne.adresse}
        actions={ecriture && <Button icon={<EditOutlined />} onClick={() => setEdition(true)}>Modifier</Button>}
      />
      <Card size="small">
        <Tabs items={onglets} destroyOnHidden />
      </Card>
      <BorneForm borne={borne} ouvert={edition} onFermer={() => setEdition(false)} />
    </div>
  )
}
