import { useState } from 'react'
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { BankOutlined, KeyOutlined, NotificationOutlined, PlusOutlined, ShopOutlined, StopOutlined, ThunderboltOutlined, WalletOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  affecterBornesStation,
  annoncerStations,
  nouveauMotDePassePersonnel,
  creerStation,
  errorMessage,
  fetchBornes,
  fetchStation,
  fetchStations,
  modifierStation,
  payerReversement,
  reactiverStation,
  suspendreStation,
} from '../api'
import { EnTete, Kpi } from '../components/commun'
import { ClientsStation, Messagerie, PuissanceBornes, RechargesEnDirect } from '../components/ActiviteStation'
import { formatMontant, formatNombre, formatRelatif, ETAT_BORNE_COLORS, ETAT_BORNE_LABELS, ROLE_LABELS } from '../format'
import { C } from '../theme'
import type { EtatBorne, ReleveMois, Station } from '../types'

const FORMULES = { essentiel: 'Essentiel', pro: 'Pro', entreprise: 'Entreprise' }
const STATUT_RELEVE: Record<string, { label: string; couleur: string }> = {
  paye: { label: 'Reversé', couleur: 'success' },
  a_payer: { label: 'À reverser', couleur: 'warning' },
  en_cours: { label: 'Mois en cours', couleur: 'processing' },
  neant: { label: 'Aucune recharge', couleur: 'default' },
}

/** Champs du contrat d'une station (création et modification). */
function ChampsContrat() {
  return (
    <Row gutter={12}>
      <Col xs={24} md={12}><Form.Item name="nom" label="Nom commercial" rules={[{ required: true }]}><Input placeholder="Lac Énergie" /></Form.Item></Col>
      <Col xs={24} md={12}><Form.Item name="raisonSociale" label="Raison sociale"><Input /></Form.Item></Col>
      <Col xs={24} md={12}><Form.Item name="matriculeFiscal" label="Matricule fiscal"><Input /></Form.Item></Col>
      <Col xs={24} md={12}><Form.Item name="ville" label="Ville"><Input /></Form.Item></Col>
      <Col xs={24} md={12}><Form.Item name="email" label="Email de facturation"><Input type="email" /></Form.Item></Col>
      <Col xs={24} md={12}><Form.Item name="telephone" label="Téléphone"><Input /></Form.Item></Col>
      <Col xs={24}><Form.Item name="adresse" label="Adresse"><Input /></Form.Item></Col>
      <Col xs={12} md={8}>
        <Form.Item name="formule" label="Formule" rules={[{ required: true }]}>
          <Select options={Object.entries(FORMULES).map(([value, label]) => ({ value, label }))} />
        </Form.Item>
      </Col>
      <Col xs={12} md={8}>
        <Form.Item name="commissionPct" label="Commission plateforme" rules={[{ required: true }]} tooltip="Part prélevée sur chaque recharge.">
          <InputNumber min={0} max={50} step={0.5} addonAfter="%" style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col xs={12} md={8}>
        <Form.Item name="bornesMax" label="Bornes max." tooltip="Vide : illimité.">
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col xs={12} md={12}><Form.Item name="finContrat" label="Fin de contrat"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
      <Col xs={24} md={12}><Form.Item name="rib" label="RIB (reversements)"><Input /></Form.Item></Col>
    </Row>
  )
}

function versApi(v: Record<string, unknown>) {
  const fin = v.finContrat as dayjs.Dayjs | null | undefined
  return { ...v, finContrat: fin ? fin.format('YYYY-MM-DD') : null } as Partial<Station>
}

/** Tableau des relevés mensuels, avec le reversement des mois clos. */
function Releves({ stationId, releves, payable }: { stationId?: number; releves: ReleveMois[]; payable?: boolean }) {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const paiement = useMutation({
    mutationFn: ({ periode, reference }: { periode: string; reference?: string }) => payerReversement(stationId!, periode, reference),
    onSuccess: (r) => {
      message.success(r.message)
      queryClient.invalidateQueries({ queryKey: ['station', stationId] })
      queryClient.invalidateQueries({ queryKey: ['stations'] })
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const payer = (periode: string, net: number) => {
    let reference = ''
    modal.confirm({
      title: `Reverser ${formatMontant(net, 3)} pour ${dayjs(periode + '-01').format('MMMM YYYY')} ?`,
      content: <Input placeholder="Référence du virement (facultatif)" onChange={(e) => (reference = e.target.value)} />,
      okText: 'Enregistrer le virement',
      onOk: () => paiement.mutateAsync({ periode, reference: reference || undefined }),
    })
  }

  return (
    <Table
      size="small"
      rowKey="periode"
      pagination={false}
      dataSource={[...releves].reverse()}
      columns={[
        { title: 'Mois', dataIndex: 'periode', render: (p: string) => dayjs(p + '-01').format('MMMM YYYY') },
        { title: 'Recharges', dataIndex: 'sessions', align: 'right' },
        { title: 'Chiffre d’affaires', dataIndex: 'chiffreAffaires', align: 'right', render: (v: number) => formatMontant(v, 3) },
        { title: 'Commission', dataIndex: 'commission', align: 'right', render: (v: number) => <Typography.Text type="secondary">− {formatMontant(v, 3)}</Typography.Text> },
        { title: 'Net station', dataIndex: 'net', align: 'right', render: (v: number) => <strong>{formatMontant(v, 3)}</strong> },
        {
          title: 'État',
          dataIndex: 'statut',
          render: (s: string, r: ReleveMois) => (
            <Space>
              <Tag color={STATUT_RELEVE[s]?.couleur}>{STATUT_RELEVE[s]?.label ?? s}</Tag>
              {s === 'paye' && r.reference && <Typography.Text type="secondary">{r.reference}</Typography.Text>}
              {payable && s === 'a_payer' && (
                <Button size="small" type="primary" icon={<WalletOutlined />} loading={paiement.isPending} onClick={() => payer(r.periode, r.net)}>
                  Reverser
                </Button>
              )}
            </Space>
          ),
        },
      ]}
    />
  )
}

/** Fiche d'une station : contrat, bornes, personnel et relevés. */
function FicheStation({ id, onFermer }: { id: number; onFermer: () => void }) {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [annee, setAnnee] = useState(dayjs().year())
  const [aAffecter, setAAffecter] = useState<number[]>([])
  const [form] = Form.useForm()
  const { data } = useQuery({ queryKey: ['station', id, annee], queryFn: () => fetchStation(id, annee) })
  const bornes = useQuery({ queryKey: ['bornes', 'toutes'], queryFn: () => fetchBornes() })

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ['station', id] })
    queryClient.invalidateQueries({ queryKey: ['stations'] })
  }
  const enregistrer = useMutation({
    mutationFn: (v: Record<string, unknown>) => modifierStation(id, versApi(v)),
    onSuccess: () => { message.success('Contrat enregistré'); rafraichir() },
    onError: (e) => message.error(errorMessage(e)),
  })
  const statut = useMutation({
    mutationFn: (motif?: string) => (motif ? suspendreStation(id, motif) : reactiverStation(id)),
    onSuccess: () => { message.success('Statut de la station mis à jour'); rafraichir() },
    onError: (e) => message.error(errorMessage(e)),
  })
  const affectation = useMutation({
    mutationFn: () => affecterBornesStation(id, aAffecter),
    onSuccess: (r) => { message.success(r.message); setAAffecter([]); rafraichir(); queryClient.invalidateQueries({ queryKey: ['bornes'] }) },
    onError: (e) => message.error(errorMessage(e)),
  })

  const suspendre = () => {
    let motif = ''
    modal.confirm({
      title: `Suspendre ${data?.nom} ?`,
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">Ses bornes disparaissent de l’application et son personnel perd l’accès au back-office.</Typography.Text>
          <Input placeholder="Motif (ex. facture impayée)" onChange={(e) => (motif = e.target.value)} />
        </Space>
      ),
      okText: 'Suspendre',
      okButtonProps: { danger: true },
      onOk: () => (motif.trim() ? statut.mutateAsync(motif.trim()) : Promise.reject(message.warning('Indiquez un motif.'))),
    })
  }

  return (
    <Drawer
      open
      width={900}
      onClose={onFermer}
      title={data ? <Space><span className="point-station" style={{ background: data.couleur ?? C.rougeVif }} />{data.nom}</Space> : 'Station'}
      extra={
        data && (data.statut === 'actif'
          ? <Button danger icon={<StopOutlined />} onClick={suspendre}>Suspendre</Button>
          : <Button type="primary" icon={<CheckCircleOutlined />} loading={statut.isPending} onClick={() => statut.mutate(undefined)}>Réactiver</Button>)
      }
    >
      {data && (
        <Tabs
          defaultActiveKey="activite"
          items={[
            {
              key: 'activite',
              label: 'Activité en direct',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Card size="small" title="Recharges en cours"><RechargesEnDirect recharges={data.recharges} /></Card>
                  <Card size="small" title="Puissance des bornes"><PuissanceBornes bornes={data.bornesActivite} /></Card>
                  <Card size="small" title="Clients du mois"><ClientsStation clients={data.clients} /></Card>
                </Space>
              ),
            },
            {
              key: 'messages',
              label: <Badge count={data.messagesNonLus ?? 0} size="small" offset={[8, 0]}>Messages</Badge>,
              children: <Messagerie stationId={id} />,
            },
            {
              key: 'releves',
              label: 'Relevés & reversements',
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Select value={annee} onChange={setAnnee} style={{ width: 120 }} options={[0, 1, 2].map((d) => ({ value: dayjs().year() - d, label: String(dayjs().year() - d) }))} />
                  <Releves stationId={id} releves={data.releves} payable />
                </Space>
              ),
            },
            {
              key: 'contrat',
              label: 'Contrat',
              children: (
                <Form
                  form={form}
                  layout="vertical"
                  initialValues={{ ...data, finContrat: data.finContrat ? dayjs(data.finContrat) : null }}
                  onFinish={(v) => enregistrer.mutate(v)}
                >
                  {data.statut === 'suspendu' && <Tag color="error" style={{ marginBottom: 12 }}>Suspendue : {data.motifSuspension}</Tag>}
                  <ChampsContrat />
                  <Button type="primary" htmlType="submit" loading={enregistrer.isPending}>Enregistrer</Button>
                </Form>
              ),
            },
            {
              key: 'bornes',
              label: `Bornes (${data.bornes}${data.bornesMax ? ` / ${data.bornesMax}` : ''})`,
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Select
                      mode="multiple"
                      style={{ width: '100%' }}
                      placeholder="Rattacher des bornes à cette station…"
                      value={aAffecter}
                      onChange={setAAffecter}
                      optionFilterProp="label"
                      options={(bornes.data ?? [])
                        .filter((b) => b.source !== 'publique' && b.stationId !== id)
                        .map((b) => ({ value: b.id, label: `${b.nom} · ${b.stationNom ?? 'sans station'}` }))}
                    />
                    <Button type="primary" disabled={!aAffecter.length} loading={affectation.isPending} onClick={() => affectation.mutate()}>Rattacher</Button>
                  </Space.Compact>
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={data.bornesListe}
                    locale={{ emptyText: <Empty description="Aucune borne" /> }}
                    columns={[
                      { title: 'Borne', dataIndex: 'nom', render: (n: string, b) => <a href={`/bornes/${b.id}`}>{n}</a> },
                      { title: 'Référence', dataIndex: 'reference', render: (r: string) => <span className="texte-mono">{r}</span> },
                      { title: 'Puissance', dataIndex: 'puissanceKw', render: (p: number) => `${p} kW` },
                      { title: 'État', dataIndex: 'etat', render: (e: EtatBorne) => <Tag color={ETAT_BORNE_COLORS[e]}>{ETAT_BORNE_LABELS[e] ?? e}</Tag> },
                      { title: 'OCPP', dataIndex: 'enLigne', render: (l: boolean) => <Tag color={l ? 'success' : 'default'}>{l ? 'En ligne' : 'Hors ligne'}</Tag> },
                    ]}
                  />
                </Space>
              ),
            },
            {
              key: 'personnel',
              label: `Personnel (${data.personnel})`,
              children: (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={data.personnelListe}
                  columns={[
                    { title: 'Nom', dataIndex: 'nom' },
                    { title: 'Email', dataIndex: 'email' },
                    { title: 'Rôle', dataIndex: 'role', render: (r: keyof typeof ROLE_LABELS) => ROLE_LABELS[r] ?? r },
                    { title: 'Dernière connexion', dataIndex: 'derniereConnexion', render: (d: string | null) => (d ? formatRelatif(d) : 'Jamais') },
                    {
                      title: '',
                      key: 'mdp',
                      render: (_, u) => (
                        <Popconfirm
                          title={`Nouveau mot de passe pour ${u.nom} ?`}
                          description="L’ancien ne fonctionnera plus et ses sessions ouvertes seront fermées."
                          okText="Générer"
                          onConfirm={async () => {
                            try {
                              const r = await nouveauMotDePassePersonnel(id, u.id)
                              modal.success({
                                title: 'Nouveau mot de passe',
                                content: (
                                  <Space direction="vertical">
                                    <Typography.Text>Transmettez ces accès à la personne (affichés une seule fois) :</Typography.Text>
                                    <Descriptions bordered size="small" column={1}>
                                      <Descriptions.Item label="Email"><Typography.Text copyable>{r.email}</Typography.Text></Descriptions.Item>
                                      <Descriptions.Item label="Mot de passe"><Typography.Text copyable className="texte-mono">{r.motDePasse}</Typography.Text></Descriptions.Item>
                                    </Descriptions>
                                  </Space>
                                ),
                              })
                            } catch (e) {
                              message.error(errorMessage(e))
                            }
                          }}
                        >
                          <Button size="small" icon={<KeyOutlined />}>Nouveau mot de passe</Button>
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      )}
    </Drawer>
  )
}

/** Console du super-admin : les stations clientes, leur activité et les reversements. */
export default function StationsPage() {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [ouverte, setOuverte] = useState<number | null>(null)
  const [creation, setCreation] = useState(false)
  const [form] = Form.useForm()
  const { data, isLoading } = useQuery({ queryKey: ['stations'], queryFn: fetchStations })

  const creer = useMutation({
    mutationFn: (v: Record<string, unknown>) => creerStation({ ...versApi(v), admin: v.admin as { prenom: string; nom: string; email: string } }),
    onSuccess: (s) => {
      setCreation(false)
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['stations'] })
      modal.success({
        title: `Station « ${s.nom} » créée`,
        content: (
          <Space direction="vertical">
            <Typography.Text>Transmettez ces accès à l’administrateur de la station (affichés une seule fois) :</Typography.Text>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Email"><Typography.Text copyable>{s.acces.email}</Typography.Text></Descriptions.Item>
              <Descriptions.Item label="Mot de passe"><Typography.Text copyable className="texte-mono">{s.acces.motDePasse}</Typography.Text></Descriptions.Item>
            </Descriptions>
          </Space>
        ),
      })
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const p = data?.plateforme

  const annoncer = () => {
    let texte = ''
    modal.confirm({
      title: 'Annonce à toutes les stations actives',
      icon: <NotificationOutlined />,
      content: <Input.TextArea rows={4} maxLength={3000} placeholder="Ex. : maintenance de la plateforme dimanche de 2 h à 4 h." onChange={(e) => (texte = e.target.value)} />,
      okText: 'Envoyer',
      onOk: async () => {
        if (!texte.trim()) {
          message.warning('Écrivez le texte de l’annonce.')
          throw new Error('vide')
        }
        const r = await annoncerStations(texte.trim())
        message.success(r.message)
        queryClient.invalidateQueries({ queryKey: ['messagerie'] })
      },
    })
  }

  return (
    <div className="page">
      <EnTete
        surtitre="Plateforme"
        titre="Stations clientes"
        sousTitre="Les sociétés qui exploitent leurs bornes sur Volteo : contrats, activité et reversements."
        actions={
          <Space wrap>
            <Button icon={<NotificationOutlined />} onClick={annoncer}>Annonce à toutes les stations</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreation(true)}>Nouvelle station</Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}><Kpi titre="Stations actives" valeur={`${p?.stationsActives ?? 0} / ${p?.stations ?? 0}`} icone={<ShopOutlined />} chargement={isLoading} pied={`${p?.bornes ?? 0} bornes sur le réseau`} /></Col>
        <Col xs={12} lg={6}><Kpi titre="Chiffre d’affaires du mois" valeur={formatMontant(p?.chiffreAffairesMois ?? 0)} icone={<ThunderboltOutlined />} chargement={isLoading} pied={`${p?.sessionsEnCours ?? 0} recharge(s) en cours`} /></Col>
        <Col xs={12} lg={6}><Kpi titre="Vos commissions du mois" valeur={formatMontant(p?.commissionMois ?? 0)} icone={<BankOutlined />} couleur={C.cuivre} chargement={isLoading} pied="Revenu de la plateforme" /></Col>
        <Col xs={12} lg={6}><Kpi titre="À reverser aux stations" valeur={formatMontant(p?.aReverser ?? 0)} icone={<WalletOutlined />} chargement={isLoading} pied={p?.bornesSansStation ? `${p.bornesSansStation} borne(s) sans station` : 'Mois clos non reversés'} /></Col>
      </Row>

      <Card>
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={data?.stations}
          onRow={(s) => ({ onClick: () => setOuverte(s.id), style: { cursor: 'pointer' } })}
          pagination={false}
          columns={[
            { title: 'Station', dataIndex: 'nom', render: (n: string, s) => <Space><span className="point-station" style={{ background: s.couleur ?? C.rougeVif }} /><strong>{n}</strong><Typography.Text type="secondary">{s.ville}</Typography.Text></Space> },
            { title: 'Formule', dataIndex: 'formule', render: (f: keyof typeof FORMULES) => <Tag>{FORMULES[f]}</Tag> },
            { title: 'Bornes', dataIndex: 'bornes', align: 'right', render: (n: number, s) => `${n}${s.bornesMax ? ` / ${s.bornesMax}` : ''}` },
            { title: 'Recharges (mois)', render: (_, s) => formatNombre(s.mois.sessions), align: 'right' },
            { title: 'CA du mois', render: (_, s) => formatMontant(s.mois.chiffreAffaires), align: 'right' },
            { title: 'Commission', render: (_, s) => <Typography.Text style={{ color: C.cuivre }}>{formatMontant(s.mois.commission)} ({s.commissionPct} %)</Typography.Text>, align: 'right' },
            { title: 'Messages', dataIndex: 'messagesNonLus', align: 'center', render: (n?: number) => (n ? <Badge count={n} /> : <Typography.Text type="secondary">—</Typography.Text>) },
            { title: 'Statut', dataIndex: 'statut', render: (st: string, s) => <Tag color={st === 'actif' && s.active ? 'success' : 'error'}>{st === 'actif' ? (s.active ? 'Active' : 'Contrat échu') : 'Suspendue'}</Tag> },
          ]}
        />
      </Card>

      {ouverte && <FicheStation id={ouverte} onFermer={() => setOuverte(null)} />}

      <Drawer open={creation} width={720} title="Nouvelle station cliente" onClose={() => setCreation(false)}
        extra={<Popconfirm title="Créer la station et son compte administrateur ?" onConfirm={() => form.submit()}><Button type="primary" loading={creer.isPending}>Créer</Button></Popconfirm>}>
        <Form form={form} layout="vertical" initialValues={{ formule: 'pro', commissionPct: 10 }} onFinish={(v) => creer.mutate(v)}>
          <ChampsContrat />
          <Typography.Title level={5}>Administrateur de la station</Typography.Title>
          <Row gutter={12}>
            <Col xs={24} md={8}><Form.Item name={['admin', 'prenom']} label="Prénom" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name={['admin', 'nom']} label="Nom" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name={['admin', 'email']} label="Email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Drawer>
    </div>
  )
}

export { Releves }
