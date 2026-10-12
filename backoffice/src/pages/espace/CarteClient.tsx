import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, App, Button, Card, Col, Descriptions, Drawer, Input, List, Row, Select, Space, Switch, Tag, Typography } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, espace } from '../../api'
import CarteBornes from '../../components/CarteBornes'
import { ETAT_BORNE_COLORS, ETAT_BORNE_LABELS, ETAT_CONNECTEUR_COLORS, ETAT_CONNECTEUR_LABELS, formatMontant } from '../../format'
import type { Borne } from '../../types'

/** Bornes en lecture (§7 : le client consulte les bornes) + démarrage d'une recharge. */
export default function EspaceCarte() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selection, setSelection] = useState<Borne | null>(null)
  const [recherche, setRecherche] = useState('')
  const [dispo, setDispo] = useState(false)
  const [vehicule, setVehicule] = useState<number>()

  const { data: bornes } = useQuery({ queryKey: ['espace', 'bornes'], queryFn: espace.bornes, refetchInterval: 30_000 })
  const { data: vehicules } = useQuery({ queryKey: ['espace', 'vehicules'], queryFn: espace.vehicules })
  const { data: active } = useQuery({ queryKey: ['espace', 'active'], queryFn: espace.sessionActive })

  const filtrees = useMemo(() => {
    const t = recherche.trim().toLowerCase()
    return (bornes ?? []).filter((b) => (!dispo || b.etat === 'disponible') && (!t || `${b.nom} ${b.adresse}`.toLowerCase().includes(t)))
  }, [bornes, recherche, dispo])

  const demarrage = useMutation({
    mutationFn: ({ borneId, connecteurId }: { borneId: number; connecteurId: number }) => espace.demarrer(borneId, connecteurId, vehicule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['espace'] })
      navigate('/espace/recharge')
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  return (
    <div className="pile">
      <Typography.Title level={3} style={{ margin: 0 }}>Trouver une borne</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card size="small" styles={{ body: { padding: 0 } }} title={
            <Space direction="vertical" style={{ width: '100%', padding: '8px 0' }}>
              <Input.Search placeholder="Ville, adresse, nom" allowClear onChange={(e) => setRecherche(e.target.value)} />
              <Space><Switch size="small" checked={dispo} onChange={setDispo} /><Typography.Text style={{ fontWeight: 400 }}>Disponibles uniquement</Typography.Text></Space>
            </Space>
          }>
            <List
              style={{ maxHeight: 520, overflow: 'auto' }}
              dataSource={filtrees}
              renderItem={(b) => (
                <List.Item className="ligne-cliquable" style={{ paddingInline: 16, background: selection?.id === b.id ? 'rgba(240,66,87,0.12)' : undefined }} onClick={() => setSelection(b)}>
                  <List.Item.Meta
                    title={<Space size={6}>{b.nom}{b.source === 'publique' ? <Tag>Autre opérateur</Tag> : <Tag color={ETAT_BORNE_COLORS[b.etat]}>{ETAT_BORNE_LABELS[b.etat]}</Tag>}</Space>}
                    description={<span style={{ fontSize: 12 }}>{b.adresse}</span>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card size="small" styles={{ body: { padding: 8 } }}>
            <CarteBornes points={filtrees} hauteur={600} selection={selection?.id} onSelect={setSelection} />
          </Card>
        </Col>
      </Row>

      <Drawer open={!!selection} onClose={() => setSelection(null)} title={selection?.nom} width={440}>
        {selection && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Adresse">{selection.adresse}</Descriptions.Item>
              {selection.source === 'publique' ? (
                <Descriptions.Item label="Opérateur">{selection.operateur ?? 'Autre opérateur'}</Descriptions.Item>
              ) : (
                <>
                  <Descriptions.Item label="État"><Tag color={ETAT_BORNE_COLORS[selection.etat]}>{ETAT_BORNE_LABELS[selection.etat]}</Tag></Descriptions.Item>
                  <Descriptions.Item label="Puissance">{selection.puissanceKw} kW</Descriptions.Item>
                  <Descriptions.Item label="Prix indicatif">{formatMontant(selection.tarifKwh, 3)} / kWh</Descriptions.Item>
                </>
              )}
            </Descriptions>
            {selection.source === 'publique' ? (
              <Alert type="info" showIcon message="Borne d'un autre opérateur : la recharge se lance depuis la borne ou l'application de l'opérateur." />
            ) : (
              <>
                {active && <Alert type="warning" showIcon message="Vous avez déjà une recharge en cours." />}
                <Select placeholder="Mon véhicule" allowClear value={vehicule} onChange={setVehicule} style={{ width: '100%' }}
                  options={(vehicules ?? []).map((v) => ({ value: v.id, label: `${v.marque} ${v.modele} — ${v.immatriculation}` }))} />
                <List
                  dataSource={selection.connecteurs}
                  renderItem={(c) => (
                    <List.Item
                      actions={[
                        <Button key="go" type="primary" icon={<ThunderboltOutlined />} disabled={c.etat !== 'disponible' || !!active} loading={demarrage.isPending}
                          onClick={() => demarrage.mutate({ borneId: selection.id, connecteurId: c.id })}>Démarrer</Button>,
                      ]}
                    >
                      <List.Item.Meta title={`${c.type} · ${c.puissanceKw} kW`} description={<Tag color={ETAT_CONNECTEUR_COLORS[c.etat]}>{ETAT_CONNECTEUR_LABELS[c.etat]}</Tag>} />
                    </List.Item>
                  )}
                />
              </>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  )
}
