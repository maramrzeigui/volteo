import { useState } from 'react'
import { Alert, App, Button, Card, Drawer, Form, Input, InputNumber, Modal, Result, Select, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, QrcodeOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '../api'
import { EnTete } from '../components/commun'
import { ModaleEtiquetteBatterie, VuePasseport } from '../components/PasseportBatterie'
import { formatDate } from '../format'
import { adresseCourte, fabricant, STATUT_BATTERIE, type Batterie } from '../lib/volteoChain'

const CHIMIES = ['NMC', 'LFP', 'NCA', 'LMO']

/** Espace fabricant : chaque batterie produite reçoit son NFT, son étiquette QR et son code d'activation. */
export default function BatteriesPage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const [q, setQ] = useState('')
  const [nouvelle, setNouvelle] = useState(false)
  const [creee, setCreee] = useState<Batterie | null>(null)
  const [etiquette, setEtiquette] = useState<Batterie | null>(null)
  const [detail, setDetail] = useState<number | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['fabricant', 'batteries', q], queryFn: () => fabricant.liste(q || undefined) })
  const { data: fiche, isLoading: chargementFiche } = useQuery({
    queryKey: ['fabricant', 'batterie', detail],
    queryFn: () => fabricant.detail(detail!),
    enabled: detail !== null,
  })

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['fabricant'] })

  const creation = useMutation({
    mutationFn: fabricant.creer,
    onSuccess: (b) => {
      rafraichir()
      setNouvelle(false)
      form.resetFields()
      if (b.statut === 'creee') setCreee(b)
      else message.error(`Batterie enregistrée mais NFT non créé : ${b.erreur ?? 'blockchain indisponible'}`)
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const nouvelEssai = useMutation({
    mutationFn: fabricant.reessayer,
    onSuccess: (b) => {
      rafraichir()
      if (b.statut === 'creee') message.success(`NFT n° ${b.tokenId} créé`)
      else message.error(b.erreur ?? 'Échec blockchain')
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const colonnes: ColumnsType<Batterie> = [
    { title: 'N° de série', dataIndex: 'numSerie', render: (n: string) => <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>{n}</Typography.Text> },
    { title: 'Modèle', dataIndex: 'modele', render: (m: string, b) => <span style={{ whiteSpace: 'nowrap' }}>{m} · {b.capaciteKwh} kWh</span> },
    { title: 'VIN', dataIndex: 'vin', render: (v: string | null) => v ?? '—' },
    { title: 'NFT', dataIndex: 'tokenId', render: (t: number | null, b) => (t ? <Tooltip title={b.txCreation}><Tag icon={<SafetyCertificateOutlined />} color="green">n° {t}</Tag></Tooltip> : '—') },
    {
      title: 'Statut',
      dataIndex: 'statut',
      render: (s: Batterie['statut'], b) => (
        <Tooltip title={b.erreur}><Tag color={STATUT_BATTERIE[s].couleur}>{STATUT_BATTERIE[s].label}</Tag></Tooltip>
      ),
    },
    { title: 'Propriétaire', dataIndex: 'proprietaire', render: (p: string | null) => p ?? 'Fabricant' },
    { title: 'Créée le', dataIndex: 'creeeLe', render: (d: string) => formatDate(d) },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, b) => (
        <Space>
          {(b.statut === 'echec' || b.statut === 'en_attente') && (
            <Button size="small" icon={<ReloadOutlined />} loading={nouvelEssai.isPending} onClick={(e) => { e.stopPropagation(); nouvelEssai.mutate(b.id) }}>
              Réessayer
            </Button>
          )}
          {b.tokenId && (
            <Button size="small" icon={<QrcodeOutlined />} onClick={async (e) => { e.stopPropagation(); setEtiquette((await fabricant.detail(b.id)).data) }}>
              Étiquette
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <>
      <EnTete
        surtitre="Volteo Chain"
        titre="Mes batteries"
        sousTitre="Chaque batterie enregistrée reçoit un NFT unique dans la blockchain : son passeport infalsifiable."
        actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => setNouvelle(true)}>Nouvelle batterie</Button>}
      />
      {data && !data.blockchain && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Blockchain non configurée" description="Renseignez BLOCKCHAIN_PONT_URL dans le .env de l’API et lancez le pont (blockchain/)." />
      )}
      <Card>
        <Input.Search placeholder="N° de série ou VIN" allowClear onSearch={setQ} style={{ maxWidth: 320, marginBottom: 16 }} />
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={data?.data ?? []}
          columns={colonnes}
          scroll={{ x: true }}
          onRow={(b) => ({ onClick: () => setDetail(b.id), style: { cursor: 'pointer' } })}
        />
      </Card>

      <Modal
        open={nouvelle}
        title="Enregistrer une batterie"
        okText="Enregistrer et créer le NFT"
        confirmLoading={creation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setNouvelle(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(v) => creation.mutate(v)} initialValues={{ chimie: 'NMC' }}>
          <Form.Item name="numSerie" label="Numéro de série" rules={[{ required: true }, { pattern: /^[A-Za-z0-9-]+$/, message: 'Lettres, chiffres et tirets' }]}>
            <Input placeholder="BAT-2026-00017" />
          </Form.Item>
          <Form.Item name="modele" label="Modèle" rules={[{ required: true }]}>
            <Input placeholder="Renault Mégane E-Tech" />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="capaciteKwh" label="Capacité (kWh)" rules={[{ required: true }]}>
              <InputNumber min={1} max={300} placeholder="60" />
            </Form.Item>
            <Form.Item name="chimie" label="Chimie">
              <Select style={{ width: 120 }} options={CHIMIES.map((c) => ({ value: c, label: c }))} />
            </Form.Item>
          </Space>
          <Form.Item name="vin" label="VIN de la voiture (17 caractères)" rules={[{ len: 17, message: '17 caractères' }]}>
            <Input placeholder="VF1RCB00012345678" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={!!creee} footer={null} onCancel={() => setCreee(null)} centered destroyOnHidden>
        {creee && (
          <Result
            status="success"
            title={`NFT n° ${creee.tokenId} créé`}
            subTitle={<>La batterie {creee.numSerie} est inscrite dans la blockchain.<br />Transaction <Typography.Text code>{adresseCourte(creee.txCreation)}</Typography.Text></>}
            extra={
              <Space direction="vertical">
                <Alert type="info" showIcon message={<>Code d’activation : <strong style={{ letterSpacing: 2 }}>{creee.codeActivation}</strong></>} description="À imprimer sur la facture de l’acheteur, jamais sur la batterie." />
                <Button type="primary" icon={<QrcodeOutlined />} onClick={() => { setEtiquette(creee); setCreee(null) }}>Imprimer l’étiquette</Button>
              </Space>
            }
          />
        )}
      </Modal>

      <ModaleEtiquetteBatterie batterie={etiquette} onFermer={() => setEtiquette(null)} />

      <Drawer open={detail !== null} onClose={() => setDetail(null)} width={760} title={fiche ? `Passeport · ${fiche.data.numSerie}` : 'Passeport'} destroyOnHidden>
        {chargementFiche || !fiche ? (
          <Spin />
        ) : fiche.passeport ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {fiche.data.statut === 'creee' && fiche.data.codeActivation && (
              <Alert type="info" showIcon message={<>Code d’activation (facture de l’acheteur) : <strong style={{ letterSpacing: 2 }}>{fiche.data.codeActivation}</strong></>} />
            )}
            <VuePasseport passeport={fiche.passeport} />
          </Space>
        ) : (
          <Result status="warning" title="Passeport indisponible" subTitle={fiche.data.erreur ?? 'Le NFT n’est pas encore créé ou la blockchain est injoignable.'} />
        )}
      </Drawer>
    </>
  )
}
