import { useState } from 'react'
import { Alert, App, Button, Card, Empty, Form, Input, Modal, Segmented, Select, Space, Spin, Typography } from 'antd'
import { SafetyCertificateOutlined, SwapOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, espace } from '../../api'
import { VuePasseport } from '../../components/PasseportBatterie'
import { conducteur, type Batterie } from '../../lib/volteoChain'

/** « Ma batterie » : activer le NFT de sa batterie, voir son passeport certifié, la céder à la revente. */
export default function EspaceBatterie() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const [mode, setMode] = useState<'numSerie' | 'vin'>('numSerie')
  const [cession, setCession] = useState<Batterie | null>(null)
  const [email, setEmail] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['espace', 'batteries'], queryFn: conducteur.batteries })
  const { data: vehicules } = useQuery({ queryKey: ['espace', 'vehicules'], queryFn: espace.vehicules })
  const invalider = () => queryClient.invalidateQueries({ queryKey: ['espace', 'batteries'] })

  const activation = useMutation({
    mutationFn: conducteur.activer,
    onSuccess: (r) => {
      message.success(`Batterie certifiée · NFT n° ${r.data.tokenId} : vous en êtes le propriétaire`)
      form.resetFields()
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const cessionMut = useMutation({
    mutationFn: () => conducteur.ceder(cession!.id, email),
    onSuccess: (r) => { message.success(r.message); setCession(null); setEmail(''); invalider() },
    onError: (e) => message.error(errorMessage(e)),
  })

  if (isLoading) return <Spin />

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>Ma batterie</Typography.Title>
        <Typography.Text type="secondary">Le passeport blockchain de votre batterie : chaque recharge Volteo y est certifiée.</Typography.Text>
      </div>

      {data?.data.map((b) => (
        <Card
          key={b.id}
          title={<Space><SafetyCertificateOutlined style={{ color: '#2FBF71' }} />{b.modele} · {b.numSerie}</Space>}
          extra={<Button icon={<SwapOutlined />} onClick={() => setCession(b)}>Céder (revente)</Button>}
        >
          {b.vehicule && <Typography.Paragraph type="secondary">Installée dans : {b.vehicule}</Typography.Paragraph>}
          {b.passeport ? <VuePasseport passeport={b.passeport} /> : <Alert type="warning" message="Blockchain injoignable : passeport momentanément indisponible." />}
        </Card>
      ))}

      <Card title="Activer la batterie de mon véhicule">
        {!vehicules?.length ? (
          <Empty description="Ajoutez d’abord votre véhicule dans « Mes véhicules »." />
        ) : (
          <Form form={form} layout="vertical" onFinish={(v) => activation.mutate({ ...v, [mode === 'numSerie' ? 'vin' : 'numSerie']: undefined })} style={{ maxWidth: 480 }}>
            <Form.Item label="Identifier la batterie par">
              <Segmented value={mode} onChange={(v) => setMode(v as 'numSerie' | 'vin')} options={[{ value: 'numSerie', label: 'QR / n° de série' }, { value: 'vin', label: 'VIN de la voiture' }]} />
            </Form.Item>
            {mode === 'numSerie' ? (
              <Form.Item name="numSerie" label="Numéro de série (ou lien du QR code)" rules={[{ required: true }]}><Input placeholder="BAT-2026-00017" /></Form.Item>
            ) : (
              <Form.Item name="vin" label="VIN (carte grise)" rules={[{ required: true, len: 17 }]}><Input placeholder="VF1RCB00012345678" style={{ textTransform: 'uppercase' }} /></Form.Item>
            )}
            <Form.Item name="code" label="Code d’activation (facture)" rules={[{ required: true }]}><Input placeholder="K7M2-9QX4" style={{ textTransform: 'uppercase' }} /></Form.Item>
            <Form.Item name="vehiculeId" label="Véhicule" rules={[{ required: true }]}>
              <Select options={vehicules.map((v) => ({ value: v.id, label: `${v.marque} ${v.modele} · ${v.immatriculation}` }))} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={activation.isPending} icon={<SafetyCertificateOutlined />}>Activer et recevoir le NFT</Button>
          </Form>
        )}
      </Card>

      <Modal open={!!cession} title="Céder la batterie à l’acheteur" okText="Transférer le NFT" confirmLoading={cessionMut.isPending}
        onOk={() => cessionMut.mutate()} onCancel={() => setCession(null)} okButtonProps={{ disabled: !email }}>
        <Typography.Paragraph>Le NFT et tout l’historique de la batterie passent au compte Volteo de l’acheteur. Cette action est définitive.</Typography.Paragraph>
        <Input type="email" placeholder="E-mail du compte Volteo de l’acheteur" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Modal>
    </Space>
  )
}
