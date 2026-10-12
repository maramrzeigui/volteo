import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
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
} from 'antd'
import { ArrowLeftOutlined, CrownOutlined, EditOutlined, ReloadOutlined, WalletOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ajusterWallet,
  attribuerAbonnement,
  errorMessage,
  fetchAbonnements,
  fetchHistoriqueUser,
  fetchUser,
  regenererQr,
  resilierSouscription,
} from '../api'
import { useAuth } from '../auth'
import SessionsTable from '../components/SessionsTable'
import { EnTete, Kpi, QrCode, Statut } from '../components/commun'
import {
  METHODE_PAIEMENT_LABELS,
  ROLE_COLORS,
  ROLE_LABELS,
  STATUT_BADGE_COLORS,
  STATUT_BADGE_LABELS,
  STATUT_PAIEMENT_COLORS,
  STATUT_PAIEMENT_LABELS,
  formatDate,
  formatEnergie,
  formatMontant,
  libelleAction,
} from '../format'
import { UserForm } from './Utilisateurs'

export default function UtilisateurDetailPage() {
  const { id } = useParams()
  const userId = Number(id)
  const { peut } = useAuth()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [edition, setEdition] = useState(false)
  const [wallet, setWallet] = useState(false)
  const [abonnement, setAbonnement] = useState(false)
  const [formWallet] = Form.useForm()
  const [formAbo] = Form.useForm()

  const { data, isLoading, isError } = useQuery({ queryKey: ['user', userId], queryFn: () => fetchUser(userId) })
  const { data: historique } = useQuery({ queryKey: ['user', userId, 'historique'], queryFn: () => fetchHistoriqueUser(userId) })
  const { data: abonnements } = useQuery({ queryKey: ['abonnements'], queryFn: fetchAbonnements, enabled: abonnement })

  const invalider = () => queryClient.invalidateQueries({ queryKey: ['user', userId] })

  const qr = useMutation({
    mutationFn: () => regenererQr(userId),
    onSuccess: () => {
      message.success('Nouveau QR code généré, l’ancien est invalidé')
      invalider()
    },
  })
  const ajustement = useMutation({
    mutationFn: (v: { montant: number; motif: string }) => ajusterWallet(userId, v.montant, v.motif),
    onSuccess: (r) => {
      message.success(`Nouveau solde : ${formatMontant(r.soldeWallet)}`)
      setWallet(false)
      formWallet.resetFields()
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const souscription = useMutation({
    mutationFn: (v: { abonnementId: number; offert: boolean }) => attribuerAbonnement(userId, v.abonnementId, v.offert),
    onSuccess: () => {
      message.success('Abonnement attribué')
      setAbonnement(false)
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const resiliation = useMutation({
    mutationFn: resilierSouscription,
    onSuccess: () => {
      message.success('Abonnement résilié')
      invalider()
    },
  })

  if (isLoading) return <Spin style={{ display: 'block', margin: 80 }} />
  if (isError || !data) return <Result status="404" title="Utilisateur introuvable" />

  const { user, stats } = data
  const ecriture = peut('utilisateurs', 'ecriture')
  const client = user.role === 'client'

  const onglets = [
    {
      key: 'apercu',
      label: "Vue d'ensemble",
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {client && (
                <Row gutter={[12, 12]}>
                  <Col xs={12} md={6}><Kpi titre="Solde wallet" valeur={formatMontant(user.soldeWallet)} /></Col>
                  <Col xs={12} md={6}><Kpi titre="Recharges" valeur={stats.sessions} /></Col>
                  <Col xs={12} md={6}><Kpi titre="Énergie" valeur={formatEnergie(stats.kwh)} /></Col>
                  <Col xs={12} md={6}><Kpi titre="Impayés" valeur={formatMontant(stats.impayes)} couleur={stats.impayes > 0 ? '#FF6B6B' : undefined} /></Col>
                </Row>
              )}
              <Descriptions bordered size="small" column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }}>
                <Descriptions.Item label="Email">{user.email}</Descriptions.Item>
                <Descriptions.Item label="Téléphone">{user.telephone ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Rôle"><Tag color={ROLE_COLORS[user.role]}>{ROLE_LABELS[user.role]}</Tag></Descriptions.Item>
                <Descriptions.Item label="Statut"><Badge status={user.actif ? 'success' : 'default'} text={user.actif ? 'Actif' : 'Désactivé'} /></Descriptions.Item>
                <Descriptions.Item label="Double authentification">{user.deuxFacteurs ? 'Activée' : 'Non'}</Descriptions.Item>
                <Descriptions.Item label="Dernière connexion">{formatDate(user.derniereConnexion)}</Descriptions.Item>
                <Descriptions.Item label="Inscrit le">{formatDate(user.createdAt)}</Descriptions.Item>
                <Descriptions.Item label="Dépenses totales">{formatMontant(stats.depenses)}</Descriptions.Item>
              </Descriptions>
              {client && (
                <Card
                  size="small"
                  title={<Space><CrownOutlined />Abonnement</Space>}
                  extra={ecriture && !data.souscription && <Button size="small" onClick={() => setAbonnement(true)}>Attribuer</Button>}
                >
                  {data.souscription ? (
                    <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                      <div>
                        <Typography.Text strong>{data.souscription.abonnementNom}</Typography.Text>{' '}
                        <Tag color="success">Actif</Tag>
                        <div style={{ color: 'var(--texte-doux)' }}>
                          {formatMontant(data.souscription.prixMensuel)}/mois · {data.souscription.remisePourcent} % de remise · {data.souscription.kwhInclus} kWh inclus
                          <br />Du {formatDate(data.souscription.dateDebut, false)} au {formatDate(data.souscription.dateFin, false)}
                          {data.souscription.renouvellementAuto ? ' · renouvellement automatique' : ' · sans renouvellement'}
                        </div>
                      </div>
                      {ecriture && (
                        <Popconfirm title="Résilier immédiatement cet abonnement ?" onConfirm={() => resiliation.mutate(data.souscription!.id)}>
                          <Button danger size="small">Résilier</Button>
                        </Popconfirm>
                      )}
                    </Space>
                  ) : (
                    <Typography.Text type="secondary">Aucun abonnement actif.</Typography.Text>
                  )}
                </Card>
              )}
            </Space>
          </Col>
          <Col xs={24} lg={8}>
            <Card size="small" title="QR code d'identification" styles={{ body: { textAlign: 'center' } }}
              extra={ecriture && (
                <Tooltip title="Régénérer (invalide l'ancien)">
                  <Button size="small" icon={<ReloadOutlined />} loading={qr.isPending}
                    onClick={() => modal.confirm({ title: 'Régénérer le QR code ?', content: "L'ancien QR code ne sera plus reconnu.", onOk: () => qr.mutateAsync() })} />
                </Tooltip>
              )}
            >
              {user.qrToken ? (
                <QrCode valeur={`borneapp://user/${user.qrToken}`} nom={`qr-${user.prenom}-${user.nom}`} legende="Carte client : identification en agence ou au service client" />
              ) : (
                <Empty />
              )}
            </Card>
          </Col>
        </Row>
      ),
    },
    ...(peut('sessions') ? [{ key: 'sessions', label: `Recharges (${user.nbSessions ?? 0})`, children: <SessionsTable filtresFixes={{ user_id: user.id }} /> }] : []),
    {
      key: 'vehicules',
      label: `Véhicules (${data.vehicules.length})`,
      children: (
        <Table rowKey="id" size="small" dataSource={data.vehicules} pagination={false}
          columns={[
            { title: 'Véhicule', render: (_, v) => `${v.marque} ${v.modele}` },
            { title: 'Immatriculation', dataIndex: 'immatriculation' },
            { title: 'Connecteur', dataIndex: 'typeConnecteur' },
            { title: 'Batterie', dataIndex: 'capaciteBatterieKwh', render: (c) => `${c} kWh` },
          ]}
        />
      ),
    },
    {
      key: 'badges',
      label: `Badges RFID (${data.badges.length})`,
      children: (
        <Table rowKey="id" size="small" dataSource={data.badges} pagination={false}
          columns={[
            { title: 'UID', dataIndex: 'uid', render: (u) => <span className="texte-mono">{u}</span> },
            { title: 'Libellé', dataIndex: 'libelle' },
            { title: 'Statut', dataIndex: 'statut', render: (s) => <Statut valeur={s} libelles={STATUT_BADGE_LABELS} couleurs={STATUT_BADGE_COLORS} /> },
            { title: 'Expiration', dataIndex: 'dateExpiration', render: (d) => formatDate(d, false) },
            { title: 'Dernière utilisation', dataIndex: 'derniereUtilisation', render: (d) => formatDate(d) },
          ]}
          footer={() => peut('rfid') && <a onClick={() => navigate('/badges')}>Gérer les badges</a>}
        />
      ),
    },
    {
      key: 'paiements',
      label: 'Paiements',
      children: (
        <Table rowKey="id" size="small" dataSource={data.paiements} pagination={{ pageSize: 10, hideOnSinglePage: true }}
          columns={[
            { title: 'Date', dataIndex: 'date', render: (d) => formatDate(d) },
            { title: 'Objet', dataIndex: 'objet' },
            { title: 'Méthode', dataIndex: 'methode', render: (m) => METHODE_PAIEMENT_LABELS[m] ?? m },
            { title: 'Montant', dataIndex: 'montant', render: (m) => formatMontant(m) },
            { title: 'Statut', dataIndex: 'statut', render: (s) => <Statut valeur={s} libelles={STATUT_PAIEMENT_LABELS} couleurs={STATUT_PAIEMENT_COLORS} /> },
          ]}
        />
      ),
    },
    {
      key: 'historique',
      label: 'Historique',
      children: historique?.length ? (
        <Timeline
          items={historique.map((h) => ({
            color: h.action.includes('echouee') ? 'red' : h.action.startsWith('connexion') ? 'green' : 'processing',
            children: (
              <>
                <Typography.Text strong>{libelleAction(h.action)}</Typography.Text>{' '}
                <Typography.Text type="secondary">par {h.auteur}</Typography.Text>
                <div style={{ fontSize: 12, color: 'var(--texte-doux)' }}>
                  {formatDate(h.date)} · {h.cible}{h.ip && ` · ${h.ip}`}
                  {h.details && <div className="texte-mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{h.details}</div>}
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
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
            {user.prenom} {user.nom}
            <Tag color={ROLE_COLORS[user.role]}>{ROLE_LABELS[user.role]}</Tag>
            {!user.actif && <Tag>Désactivé</Tag>}
          </Space>
        }
        sousTitre={user.email}
        actions={
          <>
            {client && peut('paiements', 'ecriture') && <Button icon={<WalletOutlined />} onClick={() => setWallet(true)}>Ajuster le wallet</Button>}
            {ecriture && <Button type="primary" icon={<EditOutlined />} onClick={() => setEdition(true)}>Modifier</Button>}
          </>
        }
      />
      <Card size="small"><Tabs items={onglets} /></Card>

      <UserForm user={user} ouvert={edition} onFermer={() => setEdition(false)} />

      <Modal open={wallet} title="Ajuster le wallet" onCancel={() => setWallet(false)} onOk={() => formWallet.submit()} confirmLoading={ajustement.isPending}>
        <Form form={formWallet} layout="vertical" onFinish={(v) => ajustement.mutate(v)}>
          <Form.Item name="montant" label="Montant (négatif pour débiter)" rules={[{ required: true }]}>
            <InputNumber step={1} style={{ width: '100%' }} addonAfter="DT" />
          </Form.Item>
          <Form.Item name="motif" label="Motif" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Geste commercial, correction…" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={abonnement} title="Attribuer un abonnement" onCancel={() => setAbonnement(false)} onOk={() => formAbo.submit()} confirmLoading={souscription.isPending}>
        <Form form={formAbo} layout="vertical" onFinish={(v) => souscription.mutate(v)} initialValues={{ offert: false }}>
          <Form.Item name="abonnementId" label="Formule" rules={[{ required: true }]}>
            <Select options={(abonnements ?? []).filter((a) => a.actif).map((a) => ({ value: a.id, label: `${a.nom} — ${formatMontant(a.prixMensuel)}/mois` }))} />
          </Form.Item>
          <Form.Item name="offert" valuePropName="checked">
            <Checkbox>Offert (sinon débité du wallet du client)</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
