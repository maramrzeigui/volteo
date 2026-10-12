import { useEffect, useState } from 'react'
import { App, Button, Card, Col, Empty, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Typography } from 'antd'
import { CarOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, espace } from '../../api'
import type { TypeConnecteur, Vehicule } from '../../types'

const TYPES: TypeConnecteur[] = ['CCS', 'Type2', 'CHAdeMO', 'AC', 'DC']

export default function EspaceVehicules() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const [edition, setEdition] = useState<Vehicule | 'nouveau' | null>(null)
  const { data } = useQuery({ queryKey: ['espace', 'vehicules'], queryFn: espace.vehicules })

  useEffect(() => {
    if (edition === null) return
    form.resetFields()
    if (edition !== 'nouveau') form.setFieldsValue(edition)
  }, [edition, form])

  const invalider = () => queryClient.invalidateQueries({ queryKey: ['espace', 'vehicules'] })
  const sauvegarde = useMutation({
    mutationFn: (v: Partial<Vehicule>) => espace.saveVehicule(v, edition && edition !== 'nouveau' ? edition.id : undefined),
    onSuccess: () => { message.success('Véhicule enregistré'); setEdition(null); invalider() },
    onError: (e) => message.error(errorMessage(e)),
  })
  const suppression = useMutation({ mutationFn: espace.deleteVehicule, onSuccess: () => { message.success('Véhicule supprimé'); invalider() } })

  return (
    <div className="pile">
      <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>Mes véhicules</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEdition('nouveau')}>Ajouter un véhicule</Button>
      </Space>
      {data?.length ? (
        <Row gutter={[16, 16]}>
          {data.map((v) => (
            <Col xs={24} md={12} lg={8} key={v.id}>
              <Card actions={[
                <EditOutlined key="e" onClick={() => setEdition(v)} />,
                <Popconfirm key="d" title="Supprimer ce véhicule ?" onConfirm={() => suppression.mutate(v.id)}><DeleteOutlined /></Popconfirm>,
              ]}>
                <Card.Meta avatar={<CarOutlined style={{ fontSize: 28, color: '#E5545F' }} />} title={`${v.marque} ${v.modele}`}
                  description={<>{v.immatriculation}<br />{v.typeConnecteur} · batterie {v.capaciteBatterieKwh} kWh</>} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Card><Empty description="Aucun véhicule enregistré" /></Card>
      )}
      <Modal open={edition !== null} title={edition === 'nouveau' ? 'Ajouter un véhicule' : 'Modifier le véhicule'} onCancel={() => setEdition(null)} onOk={() => form.submit()} confirmLoading={sauvegarde.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(v) => sauvegarde.mutate(v)} initialValues={{ typeConnecteur: 'CCS', capaciteBatterieKwh: 50 }}>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="marque" label="Marque" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="modele" label="Modèle" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="immatriculation" label="Immatriculation" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="typeConnecteur" label="Connecteur"><Select options={TYPES.map((t) => ({ value: t, label: t }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="capaciteBatterieKwh" label="Batterie" rules={[{ required: true }]}><InputNumber min={1} max={300} addonAfter="kWh" style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}
