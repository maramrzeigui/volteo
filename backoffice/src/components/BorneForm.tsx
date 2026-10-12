import { useEffect } from 'react'
import { App, Button, Col, Divider, Form, Input, InputNumber, Modal, Row, Select, Space, Typography } from 'antd'
import { AimOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createBorne, errorMessage, fetchStations, fetchTarifs, fetchUserOptions, updateBorne } from '../api'
import { useAuth } from '../auth'
import { SelecteurPosition } from './CarteBornes'
import { ETAT_BORNE_LABELS } from '../format'
import type { Borne, BorneInput, EtatBorne, TypeConnecteur } from '../types'

const TYPES: TypeConnecteur[] = ['CCS', 'Type2', 'CHAdeMO', 'AC', 'DC']

/** Création / modification d'une borne (module 2) avec géolocalisation sur carte. */
export default function BorneForm({
  borne,
  ouvert,
  onFermer,
}: {
  borne: Borne | null
  ouvert: boolean
  onFermer: () => void
}) {
  const [form] = Form.useForm<BorneInput>()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const latitude = Form.useWatch('latitude', form)
  const longitude = Form.useWatch('longitude', form)

  const { data: tarifs } = useQuery({ queryKey: ['tarifs'], queryFn: fetchTarifs, enabled: ouvert })
  const { user } = useAuth()
  const superAdmin = user?.role === 'super_admin'
  // Le super-admin rattache la borne à une station cliente ; une station crée ses bornes chez elle.
  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: fetchStations, enabled: ouvert && superAdmin })
  const { data: personnel } = useQuery({
    queryKey: ['options', 'exploitant,technicien'],
    queryFn: () => fetchUserOptions('exploitant,technicien'),
    enabled: ouvert,
  })

  useEffect(() => {
    if (!ouvert) return
    form.resetFields()
    if (borne) {
      form.setFieldsValue({
        ...borne,
        connecteurs: undefined,
      })
    } else {
      form.setFieldsValue({
        versionOcpp: '1.6',
        puissanceKw: 22,
        tarifKwh: 0.45,
        latitude: 36.8065,
        longitude: 10.1815,
        connecteurs: [{ type: 'Type2', puissanceKw: 22 }],
      })
    }
  }, [ouvert, borne, form])

  const sauvegarde = useMutation({
    mutationFn: (v: BorneInput) => (borne ? updateBorne(borne.id, v) : createBorne(v)),
    onSuccess: () => {
      message.success(borne ? 'Borne modifiée' : 'Borne créée')
      queryClient.invalidateQueries({ queryKey: ['bornes'] })
      queryClient.invalidateQueries({ queryKey: ['borne'] })
      queryClient.invalidateQueries({ queryKey: ['supervision'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      onFermer()
    },
    onError: (e) => message.error(errorMessage(e, "Échec de l'enregistrement")),
  })

  const geolocaliser = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => form.setFieldsValue({ latitude: Number(pos.coords.latitude.toFixed(7)), longitude: Number(pos.coords.longitude.toFixed(7)) }),
      () => message.warning('Position indisponible'),
    )
  }

  const options = (role: string) => (personnel ?? []).filter((p) => p.role === role).map((p) => ({ value: p.id, label: p.nom }))

  return (
    <Modal
      open={ouvert}
      title={borne ? `Modifier ${borne.nom}` : 'Nouvelle borne'}
      onCancel={onFermer}
      onOk={() => form.submit()}
      okText="Enregistrer"
      confirmLoading={sauvegarde.isPending}
      width={880}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => sauvegarde.mutate(v)} requiredMark="optional">
        <Divider orientation="left" plain style={{ marginTop: 0 }}>Identification</Divider>
        <Row gutter={12}>
          <Col xs={24} md={12}><Form.Item name="nom" label="Nom" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="reference" label="Référence OCPP" rules={[{ required: true }]} tooltip="Identifiant de la borne dans l'URL OCPP"><Input /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="numeroSerie" label="N° de série" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="fabricant" label="Fabricant" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item name="modele" label="Modèle" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col xs={12} md={4}><Form.Item name="versionFirmware" label="Firmware" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col xs={12} md={4}><Form.Item name="versionOcpp" label="OCPP" rules={[{ required: true }]}><Select options={[{ value: '1.6', label: '1.6J' }, { value: '2.0.1', label: '2.0.1' }]} /></Form.Item></Col>
          <Col xs={12} md={4}><Form.Item name="puissanceKw" label="Puissance" rules={[{ required: true }]}><InputNumber min={1} addonAfter="kW" style={{ width: '100%' }} /></Form.Item></Col>
          {borne && (
            <Col xs={12} md={8}>
              <Form.Item name="etat" label="État">
                <Select options={(Object.keys(ETAT_BORNE_LABELS) as EtatBorne[]).map((e) => ({ value: e, label: ETAT_BORNE_LABELS[e] }))} />
              </Form.Item>
            </Col>
          )}
        </Row>

        <Divider orientation="left" plain>Localisation</Divider>
        <Row gutter={12}>
          <Col xs={24} md={14}><Form.Item name="adresse" label="Adresse" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col xs={24} md={10}><Form.Item name="site" label="Site / zone"><Input placeholder="ex. Tunis Nord" /></Form.Item></Col>
          <Col xs={10} md={8}><Form.Item name="latitude" label="Latitude" rules={[{ required: true }]}><InputNumber step={0.0001} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={10} md={8}><Form.Item name="longitude" label="Longitude" rules={[{ required: true }]}><InputNumber step={0.0001} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={4} md={8} style={{ display: 'flex', alignItems: 'center', paddingTop: 6 }}>
            <Button icon={<AimOutlined />} onClick={geolocaliser}>Ma position</Button>
          </Col>
        </Row>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Cliquez sur la carte ou déplacez le marqueur pour géolocaliser la borne.</Typography.Text>
        <div style={{ marginTop: 6 }}>
          <SelecteurPosition latitude={latitude} longitude={longitude} onChange={(lat, lng) => form.setFieldsValue({ latitude: lat, longitude: lng })} />
        </div>

        <Divider orientation="left" plain>Tarification & affectation</Divider>
        <Row gutter={12}>
          <Col xs={12} md={6}><Form.Item name="tarifKwh" label="Prix de repli" tooltip="Prix au kWh appliqué si aucun tarif n'est valide" rules={[{ required: true }]}><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} md={9}><Form.Item name="tarifId" label="Tarif standard"><Select allowClear options={(tarifs ?? []).filter((t) => !t.special && t.actif).map((t) => ({ value: t.id, label: t.nom }))} /></Form.Item></Col>
          <Col xs={24} md={9}><Form.Item name="tarifSpecialId" label="Tarif spécial"><Select allowClear options={(tarifs ?? []).filter((t) => t.special && t.actif).map((t) => ({ value: t.id, label: t.nom }))} /></Form.Item></Col>
          {superAdmin && (
            <Col xs={24}>
              <Form.Item name="stationId" label="Station propriétaire" tooltip="La station qui exploite et encaisse cette borne.">
                <Select allowClear placeholder="Sans station (réseau Volteo)" options={(stations?.stations ?? []).map((s) => ({ value: s.id, label: s.nom }))} />
              </Form.Item>
            </Col>
          )}
          <Col xs={12}><Form.Item name="exploitantId" label="Exploitant"><Select allowClear showSearch optionFilterProp="label" options={options('exploitant')} /></Form.Item></Col>
          <Col xs={12}><Form.Item name="technicienId" label="Technicien référent"><Select allowClear showSearch optionFilterProp="label" options={options('technicien')} /></Form.Item></Col>
        </Row>

        {!borne && (
          <>
            <Divider orientation="left" plain>Connecteurs</Divider>
            <Form.List name="connecteurs">
              {(champs, { add, remove }) => (
                <>
                  {champs.map(({ key, name, ...reste }) => (
                    <Space key={key} align="baseline" style={{ display: 'flex' }}>
                      <Form.Item {...reste} name={[name, 'type']} rules={[{ required: true }]}>
                        <Select style={{ width: 140 }} options={TYPES.map((t) => ({ value: t, label: t }))} />
                      </Form.Item>
                      <Form.Item {...reste} name={[name, 'puissanceKw']} rules={[{ required: true }]}>
                        <InputNumber min={1} addonAfter="kW" />
                      </Form.Item>
                      {champs.length > 1 && <MinusCircleOutlined onClick={() => remove(name)} />}
                    </Space>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ type: 'Type2', puissanceKw: 22 })}>
                    Ajouter un connecteur
                  </Button>
                </>
              )}
            </Form.List>
          </>
        )}
      </Form>
    </Modal>
  )
}
