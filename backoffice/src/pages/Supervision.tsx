import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Badge, Button, Card, Col, Input, Progress, Row, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EyeOutlined, PauseCircleOutlined, PoweroffOutlined, ReloadOutlined, WifiOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commandeBorne, errorMessage, fetchSupervision } from '../api'
import { useAuth } from '../auth'
import { EnTete, Kpi, Statut } from '../components/commun'
import {
  ETAT_BORNE_COLORS,
  ETAT_BORNE_LABELS,
  ETAT_CONNECTEUR_COLORS,
  ETAT_CONNECTEUR_LABELS,
  ETAT_SESSION_COLORS,
  ETAT_SESSION_LABELS,
  formatDate,
  formatDuree,
  formatEnergie,
  formatMontant,
  formatRelatif,
} from '../format'
import type { BorneSupervision, EtatBorne } from '../types'

function couleurTemperature(t: number | null): string {
  if (t === null) return 'default'
  if (t >= 60) return 'red'
  if (t >= 45) return 'orange'
  return 'green'
}

/** Module 4 — supervision temps réel des bornes. */
export default function SupervisionPage() {
  const { peut } = useAuth()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [recherche, setRecherche] = useState('')
  const [etats, setEtats] = useState<EtatBorne[]>([])

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['supervision'],
    queryFn: fetchSupervision,
    refetchInterval: 15_000,
  })

  const reset = useMutation({
    mutationFn: (id: number) => commandeBorne(id, 'reset'),
    onSuccess: (r) => {
      message.success(r.message)
      queryClient.invalidateQueries({ queryKey: ['supervision'] })
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const bornes = useMemo(() => {
    const t = recherche.trim().toLowerCase()
    return (data?.bornes ?? []).filter(
      (b) =>
        (etats.length === 0 || etats.includes(b.etat)) &&
        (!t || [b.nom, b.reference, b.adresse].some((c) => c.toLowerCase().includes(t))),
    )
  }, [data, recherche, etats])

  const tous = data?.bornes ?? []
  const enLigne = tous.filter((b) => b.enLigne).length
  const sessions = tous.reduce((n, b) => n + b.sessions.length, 0)
  const puissance = tous.reduce((n, b) => n + b.sessions.reduce((s, x) => s + (x.puissanceKw ?? 0), 0), 0)
  const chaudes = tous.filter((b) => (b.temperatureC ?? 0) >= 45).length

  const colonnes: ColumnsType<BorneSupervision> = [
    {
      title: 'Borne',
      dataIndex: 'nom',
      fixed: 'left',
      width: 220,
      sorter: (a, b) => a.nom.localeCompare(b.nom),
      render: (_, b) => (
        <div>
          <a onClick={() => navigate(`/bornes/${b.id}`)}>{b.nom}</a>
          <div className="texte-mono" style={{ color: 'var(--texte-doux)' }}>{b.reference}</div>
        </div>
      ),
    },
    {
      title: 'État',
      dataIndex: 'etat',
      width: 130,
      render: (e: EtatBorne) => <Statut valeur={e} libelles={ETAT_BORNE_LABELS} couleurs={ETAT_BORNE_COLORS} />,
    },
    {
      title: 'Connexion',
      width: 130,
      render: (_, b) => (
        <Tooltip title={b.websocket === null ? 'Serveur OCPP injoignable' : b.websocket ? 'WebSocket OCPP ouvert' : 'Pas de WebSocket OCPP'}>
          <span>
            <Badge status={b.enLigne ? 'success' : 'error'} text={b.enLigne ? 'En ligne' : 'Hors ligne'} />
            {b.websocket && <WifiOutlined style={{ marginLeft: 6, color: '#F2A3AA' }} />}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Occupation',
      width: 170,
      sorter: (a, b) => a.connecteursOccupes / a.connecteursTotal - b.connecteursOccupes / b.connecteursTotal,
      render: (_, b) => (
        <div>
          <Progress
            percent={b.connecteursTotal ? Math.round((b.connecteursOccupes / b.connecteursTotal) * 100) : 0}
            size="small"
            format={() => `${b.connecteursOccupes}/${b.connecteursTotal}`}
          />
          <Space size={2} wrap>
            {b.connecteurs.map((c) => (
              <Tooltip key={c.id} title={`${c.type} ${c.puissanceKw} kW — ${ETAT_CONNECTEUR_LABELS[c.etat]}`}>
                <Tag color={ETAT_CONNECTEUR_COLORS[c.etat]} style={{ fontSize: 11, marginInlineEnd: 2 }}>{c.type}</Tag>
              </Tooltip>
            ))}
          </Space>
        </div>
      ),
    },
    {
      title: 'Température',
      dataIndex: 'temperatureC',
      width: 120,
      sorter: (a, b) => (a.temperatureC ?? 0) - (b.temperatureC ?? 0),
      render: (t: number | null) => (t === null ? '—' : <Tag color={couleurTemperature(t)}>{t.toFixed(1)} °C</Tag>),
    },
    {
      title: 'Dernier heartbeat',
      dataIndex: 'dernierHeartbeat',
      width: 150,
      render: (d: string | null) => <Tooltip title={formatDate(d)}>{formatRelatif(d)}</Tooltip>,
    },
    {
      title: 'Recharge en cours',
      width: 240,
      render: (_, b) =>
        b.sessions.length === 0 ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          b.sessions.map((s) => (
            <div key={s.id}>
              <Typography.Text strong>{formatEnergie(s.energieKwh)}</Typography.Text>{' '}
              <Typography.Text type="secondary">· {s.puissanceKw ?? 0} kW</Typography.Text>
              {s.tempsRestantMinutes !== null && (
                <Typography.Text type="secondary"> · reste {formatDuree(s.tempsRestantMinutes)}</Typography.Text>
              )}
              {s.pourcentageBatterie !== null && (
                <Progress percent={s.pourcentageBatterie} size="small" strokeColor="#E5545F" />
              )}
            </div>
          ))
        ),
    },
    {
      title: 'Alertes',
      dataIndex: 'alertesOuvertes',
      width: 90,
      align: 'center',
      sorter: (a, b) => a.alertesOuvertes - b.alertesOuvertes,
      render: (n: number) => (n ? <Badge count={n} /> : <Typography.Text type="secondary">0</Typography.Text>),
    },
    {
      title: '',
      key: 'actions',
      width: 96,
      fixed: 'right',
      render: (_, b) => (
        <Space size={4}>
          <Tooltip title="Fiche borne">
            <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/bornes/${b.id}`)} />
          </Tooltip>
          {peut('supervision', 'ecriture') && (
            <Tooltip title="Reset logiciel (OCPP)">
              <Button
                size="small"
                icon={<PoweroffOutlined />}
                disabled={!b.enLigne}
                onClick={() =>
                  modal.confirm({
                    title: `Redémarrer ${b.nom} ?`,
                    content: 'Une commande OCPP Reset (Soft) sera envoyée. Les recharges en cours seront interrompues.',
                    okText: 'Redémarrer',
                    okButtonProps: { danger: true },
                    onOk: () => reset.mutateAsync(b.id),
                  })
                }
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="pile">
      <EnTete
        titre="Supervision temps réel"
        sousTitre={
          <Space size={6}>
            <Badge status={data?.serveurOcpp ? 'success' : 'error'} />
            {data?.serveurOcpp ? 'Serveur OCPP connecté' : 'Serveur OCPP injoignable'}
            {data && <>· mis à jour {formatRelatif(data.horodatage)}</>}
          </Space>
        }
        actions={
          <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()}>
            Actualiser
          </Button>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Kpi titre="Bornes en ligne" valeur={`${enLigne} / ${tous.length}`} icone={<WifiOutlined />} couleur="#F2A3AA" />
        </Col>
        <Col xs={12} md={6}>
          <Kpi titre="Recharges en cours" valeur={sessions} icone={<PauseCircleOutlined />} couleur="#E5545F" />
        </Col>
        <Col xs={12} md={6}>
          <Kpi titre="Puissance délivrée" valeur={puissance.toFixed(1)} suffixe="kW" icone={<PoweroffOutlined />} couleur="#2DD4BF" />
        </Col>
        <Col xs={12} md={6}>
          <Kpi titre="Bornes chaudes (≥ 45 °C)" valeur={chaudes} icone={<WifiOutlined />} couleur="#FF6B6B" />
        </Col>
      </Row>

      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search placeholder="Nom, référence, adresse" allowClear onChange={(e) => setRecherche(e.target.value)} style={{ width: 260 }} />
          <Select
            mode="multiple"
            allowClear
            placeholder="Filtrer par état"
            style={{ minWidth: 240 }}
            value={etats}
            onChange={setEtats}
            options={(Object.keys(ETAT_BORNE_LABELS) as EtatBorne[]).map((e) => ({ value: e, label: ETAT_BORNE_LABELS[e] }))}
          />
        </Space>
        <Table
          rowKey="id"
          size="middle"
          columns={colonnes}
          dataSource={bornes}
          loading={!data && isFetching}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          scroll={{ x: 1300 }}
          expandable={{
            rowExpandable: (b) => b.sessions.length > 0,
            expandedRowRender: (b) => (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={b.sessions}
                columns={[
                  { title: 'Session', dataIndex: 'id', render: (id: number) => `#${id}` },
                  { title: 'Client', dataIndex: 'userNom' },
                  { title: 'Prise', dataIndex: 'typeConnecteur' },
                  { title: 'État', dataIndex: 'etat', render: (e) => <Statut valeur={e} libelles={ETAT_SESSION_LABELS} couleurs={ETAT_SESSION_COLORS} /> },
                  { title: 'Début', dataIndex: 'dateDebut', render: (d: string) => formatDate(d) },
                  { title: 'Énergie', dataIndex: 'energieKwh', render: (v: number) => formatEnergie(v) },
                  { title: 'Montant', dataIndex: 'prix', render: (v: number) => formatMontant(v) },
                ]}
              />
            ),
          }}
        />
      </Card>
    </div>
  )
}
