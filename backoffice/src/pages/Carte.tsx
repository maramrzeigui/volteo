import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, Checkbox, Col, Empty, Input, List, Row, Select, Slider, Space, Switch, Tag, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { espace, fetchSupervision } from '../api'
import CarteBornes from '../components/CarteBornes'
import { EnTete } from '../components/commun'
import { ETAT_BORNE_COLORS, ETAT_BORNE_HEX, ETAT_BORNE_LABELS, formatRelatif } from '../format'
import type { EtatBorne, TypeConnecteur } from '../types'

const TYPES: TypeConnecteur[] = ['CCS', 'Type2', 'CHAdeMO', 'AC', 'DC']

interface PointGis {
  id: number
  nom: string
  adresse: string
  latitude: number
  longitude: number
  etat: string
  puissanceKw: number
  types: string[]
  publique: boolean
  operateur?: string | null
  occupation?: string
  heartbeat?: string | null
}

/** Carte GIS : vue géographique filtrable du réseau (et des bornes publiques). */
export default function CartePage() {
  const navigate = useNavigate()
  const [etats, setEtats] = useState<EtatBorne[]>(Object.keys(ETAT_BORNE_LABELS) as EtatBorne[])
  const [types, setTypes] = useState<string[]>([])
  const [puissanceMin, setPuissanceMin] = useState(0)
  const [recherche, setRecherche] = useState('')
  const [publiques, setPubliques] = useState(false)
  const [selection, setSelection] = useState<number | null>(null)

  const { data: supervision } = useQuery({ queryKey: ['supervision'], queryFn: fetchSupervision, refetchInterval: 30_000 })
  const { data: toutes } = useQuery({ queryKey: ['bornes-publiques'], queryFn: espace.bornes, enabled: publiques })

  const points = useMemo<PointGis[]>(() => {
    const reseau: PointGis[] = (supervision?.bornes ?? []).map((b) => ({
      id: b.id,
      nom: b.nom,
      adresse: b.adresse,
      latitude: b.latitude,
      longitude: b.longitude,
      etat: b.etat,
      puissanceKw: b.puissanceKw,
      types: b.connecteurs.map((c) => c.type),
      publique: false,
      occupation: `${b.connecteursOccupes}/${b.connecteursTotal}`,
      heartbeat: b.dernierHeartbeat,
    }))
    const autres: PointGis[] = publiques
      ? (toutes ?? [])
          .filter((b) => b.source === 'publique')
          .map((b) => ({
            id: b.id,
            nom: b.nom,
            adresse: b.adresse,
            latitude: b.latitude,
            longitude: b.longitude,
            etat: 'hors_service',
            puissanceKw: b.puissanceKw ?? 0,
            types: (b.connecteurs ?? []).map((c) => c.type),
            publique: true,
            operateur: b.operateur,
          }))
      : []

    const t = recherche.trim().toLowerCase()
    return [...reseau, ...autres].filter(
      (p) =>
        (p.publique || etats.includes(p.etat as EtatBorne)) &&
        (types.length === 0 || p.types.some((x) => types.includes(x))) &&
        p.puissanceKw >= puissanceMin &&
        (!t || p.nom.toLowerCase().includes(t) || p.adresse.toLowerCase().includes(t)),
    )
  }, [supervision, toutes, publiques, etats, types, puissanceMin, recherche])

  return (
    <div className="pile">
      <EnTete titre="Carte GIS" sousTitre={`${points.length} borne(s) affichée(s)`} />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={7} xl={6}>
          <Card size="small" title="Filtres">
            <Space direction="vertical" style={{ width: '100%' }} size={14}>
              <Input.Search placeholder="Nom ou adresse" allowClear onChange={(e) => setRecherche(e.target.value)} />
              <div>
                <Typography.Text type="secondary">États</Typography.Text>
                <Checkbox.Group value={etats} onChange={(v) => setEtats(v as EtatBorne[])} style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                  {(Object.keys(ETAT_BORNE_LABELS) as EtatBorne[]).map((e) => (
                    <Checkbox key={e} value={e}>
                      <Badge color={ETAT_BORNE_HEX[e]} text={ETAT_BORNE_LABELS[e]} />
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              </div>
              <div>
                <Typography.Text type="secondary">Type de connecteur</Typography.Text>
                <Select mode="multiple" allowClear placeholder="Tous" value={types} onChange={setTypes} style={{ width: '100%', marginTop: 6 }}
                  options={TYPES.map((t) => ({ value: t, label: t }))} />
              </div>
              <div>
                <Typography.Text type="secondary">Puissance minimale : {puissanceMin} kW</Typography.Text>
                <Slider min={0} max={150} step={7} value={puissanceMin} onChange={setPuissanceMin} />
              </div>
              <Space>
                <Switch checked={publiques} onChange={setPubliques} size="small" />
                <Typography.Text>Bornes publiques (autres opérateurs)</Typography.Text>
              </Space>
            </Space>
          </Card>
          <Card size="small" title="Bornes" style={{ marginTop: 16 }} styles={{ body: { maxHeight: 360, overflow: 'auto', padding: 0 } }}>
            <List
              size="small"
              dataSource={points}
              locale={{ emptyText: <Empty description="Aucune borne" /> }}
              renderItem={(p) => (
                <List.Item
                  className="ligne-cliquable"
                  style={{ paddingInline: 12, background: selection === p.id ? 'rgba(240,66,87,0.12)' : undefined }}
                  onClick={() => setSelection(p.id)}
                >
                  <List.Item.Meta
                    title={<Space size={6}><Badge color={p.publique ? '#8E8E99' : ETAT_BORNE_HEX[p.etat as EtatBorne]} />{p.nom}</Space>}
                    description={<span style={{ fontSize: 12 }}>{p.adresse}</span>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={17} xl={18}>
          <Card size="small" styles={{ body: { padding: 8 } }}>
            <CarteBornes
              points={points}
              hauteur="calc(100vh - 200px)"
              selection={selection}
              onSelect={(p) => setSelection(p.id)}
              popup={(p) => (
                <div style={{ minWidth: 200 }}>
                  <strong>{p.nom}</strong>
                  <div style={{ fontSize: 12, color: '#666' }}>{p.adresse}</div>
                  {p.publique ? (
                    <Tag style={{ marginTop: 6 }}>Publique · {p.operateur ?? 'autre opérateur'}</Tag>
                  ) : (
                    <>
                      <Tag color={ETAT_BORNE_COLORS[p.etat as EtatBorne]} style={{ marginTop: 6 }}>{ETAT_BORNE_LABELS[p.etat as EtatBorne]}</Tag>
                      <div style={{ marginTop: 4 }}>
                        {p.puissanceKw} kW · {p.types.join(', ')}
                        <br />
                        Occupation {p.occupation} · heartbeat {formatRelatif(p.heartbeat)}
                      </div>
                      <a onClick={() => navigate(`/bornes/${p.id}`)}>Ouvrir la fiche</a>
                    </>
                  )}
                </div>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
