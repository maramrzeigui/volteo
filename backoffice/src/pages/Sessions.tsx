import { useState } from 'react'
import { App, Button, Card, DatePicker, Form, Input, Modal, Select, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Dayjs } from 'dayjs'
import { createSession, errorMessage, fetchBornes, fetchUserOptions, fetchVehicules } from '../api'
import { useAuth } from '../auth'
import SessionsTable from '../components/SessionsTable'
import { EnTete } from '../components/commun'
import { ETAT_SESSION_LABELS, ORIGINE_SESSION_LABELS } from '../format'
import type { EtatSession, OrigineSession } from '../types'

function NouvelleSession({ ouvert, onFermer }: { ouvert: boolean; onFermer: () => void }) {
  const [form] = Form.useForm()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const userId = Form.useWatch('userId', form)
  const borneId = Form.useWatch('borneId', form)

  const { data: clients } = useQuery({ queryKey: ['options', 'client'], queryFn: () => fetchUserOptions('client'), enabled: ouvert })
  const { data: bornes } = useQuery({ queryKey: ['bornes', {}], queryFn: () => fetchBornes(), enabled: ouvert })
  const { data: vehicules } = useQuery({ queryKey: ['vehicules', { user_id: userId }], queryFn: () => fetchVehicules({ user_id: userId }), enabled: !!userId })
  const borne = bornes?.find((b) => b.id === borneId)

  const creation = useMutation({
    mutationFn: createSession,
    onSuccess: (s) => {
      message.success(`Session #${s.id} démarrée`)
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['supervision'] })
      form.resetFields()
      onFermer()
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  return (
    <Modal open={ouvert} title="Démarrer une recharge pour un client" onCancel={onFermer} onOk={() => form.submit()} okText="Démarrer" confirmLoading={creation.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => creation.mutate(v)}>
        <Form.Item name="userId" label="Client" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={(clients ?? []).map((c) => ({ value: c.id, label: `${c.nom} — ${c.email}` }))} />
        </Form.Item>
        <Form.Item name="vehiculeId" label="Véhicule">
          <Select allowClear disabled={!userId} options={(vehicules ?? []).map((v) => ({ value: v.id, label: `${v.marque} ${v.modele} — ${v.immatriculation}` }))} />
        </Form.Item>
        <Form.Item name="borneId" label="Borne" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" onChange={() => form.setFieldValue('connecteurId', undefined)}
            options={(bornes ?? []).filter((b) => ['disponible', 'occupee'].includes(b.etat)).map((b) => ({ value: b.id, label: b.nom }))} />
        </Form.Item>
        <Form.Item name="connecteurId" label="Connecteur" rules={[{ required: true }]}>
          <Select disabled={!borne} options={(borne?.connecteurs ?? []).map((c) => ({ value: c.id, label: `Prise ${c.numero} — ${c.type} ${c.puissanceKw} kW`, disabled: c.etat !== 'disponible' }))} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

/** Module 5 — sessions de recharge : création, début, pause, fin, annulation. */
export default function SessionsPage() {
  const { peut } = useAuth()
  const [etat, setEtat] = useState<EtatSession[]>([])
  const [origine, setOrigine] = useState<OrigineSession>()
  const [periode, setPeriode] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [q, setQ] = useState('')
  const [ouvert, setOuvert] = useState(false)

  const filtres = {
    etat: etat.join(','),
    origine,
    q,
    debut: periode?.[0]?.format('YYYY-MM-DD'),
    fin: periode?.[1]?.format('YYYY-MM-DD'),
  }

  return (
    <div className="pile">
      <EnTete
        titre="Sessions de recharge"
        actions={peut('sessions', 'ecriture') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setOuvert(true)}>Nouvelle session</Button>}
      />
      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search placeholder="Client, borne ou n° de session" allowClear onSearch={setQ} style={{ width: 260 }} />
          <Select mode="multiple" allowClear placeholder="État" style={{ minWidth: 200 }} value={etat} onChange={setEtat}
            options={(Object.keys(ETAT_SESSION_LABELS) as EtatSession[]).map((e) => ({ value: e, label: ETAT_SESSION_LABELS[e] }))} />
          <Select allowClear placeholder="Origine" style={{ width: 160 }} value={origine} onChange={setOrigine}
            options={(Object.keys(ORIGINE_SESSION_LABELS) as OrigineSession[]).map((o) => ({ value: o, label: ORIGINE_SESSION_LABELS[o] }))} />
          <DatePicker.RangePicker format="DD/MM/YYYY" value={periode} onChange={setPeriode} />
        </Space>
        <SessionsTable filtres={filtres} />
      </Card>
      <NouvelleSession ouvert={ouvert} onFermer={() => setOuvert(false)} />
    </div>
  )
}
