import { useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Button, Descriptions, Drawer, Dropdown, Empty, Input, Progress, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CloseCircleOutlined,
  FilePdfOutlined,
  MoreOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactECharts from './Graphique'
import { actionSession, annulerSession, errorMessage, fetchSession, fetchSessions, telechargerFacture } from '../api'
import { useAuth } from '../auth'
import { Statut } from './commun'
import {
  ETAT_SESSION_COLORS,
  ETAT_SESSION_LABELS,
  ORIGINE_SESSION_LABELS,
  STATUT_PAIEMENT_COLORS,
  STATUT_PAIEMENT_LABELS,
  enFuseau,
  formatDate,
  formatDuree,
  formatEnergie,
  formatMontant,
} from '../format'
import type { Session } from '../types'

/** Actions de gestion d'une session (module 5) : pause, reprise, fin, annulation. */
export function useActionsSession() {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()

  const invalider = () => {
    ;['sessions', 'session', 'supervision', 'stats', 'borne'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }))
  }

  const action = useMutation({
    mutationFn: ({ id, type }: { id: number; type: 'pause' | 'reprendre' | 'terminer' }) => actionSession(id, type),
    onSuccess: (r, { type }) => {
      message.success(r?.message ?? (type === 'terminer' ? 'Recharge terminée et facturée.' : 'Action effectuée'))
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const annulation = useMutation({
    mutationFn: ({ id, motif }: { id: number; motif: string }) => annulerSession(id, motif),
    onSuccess: () => {
      message.success('Session annulée, rien ne sera facturé.')
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const menu = (s: Session) => {
    let motif = ''
    return [
      s.etat === 'en_cours' && {
        key: 'pause',
        icon: <PauseCircleOutlined />,
        label: 'Mettre en pause',
        onClick: () => action.mutate({ id: s.id, type: 'pause' }),
      },
      s.etat === 'en_pause' && {
        key: 'reprendre',
        icon: <PlayCircleOutlined />,
        label: 'Reprendre',
        onClick: () => action.mutate({ id: s.id, type: 'reprendre' }),
      },
      {
        key: 'terminer',
        icon: <StopOutlined />,
        label: 'Terminer et facturer',
        onClick: () =>
          modal.confirm({
            title: `Terminer la session #${s.id} ?`,
            content: 'La borne reçoit un RemoteStopTransaction, le montant est calculé et débité.',
            okText: 'Terminer',
            onOk: () => action.mutateAsync({ id: s.id, type: 'terminer' }),
          }),
      },
      {
        key: 'annuler',
        icon: <CloseCircleOutlined />,
        danger: true,
        label: 'Annuler (sans facturation)',
        onClick: () =>
          modal.confirm({
            title: `Annuler la session #${s.id} ?`,
            content: (
              <Input.TextArea
                placeholder="Motif de l'annulation (obligatoire)"
                rows={3}
                onChange={(e) => (motif = e.target.value)}
                style={{ marginTop: 8 }}
              />
            ),
            okText: 'Annuler la session',
            okButtonProps: { danger: true },
            onOk: () => {
              if (!motif.trim()) {
                message.warning('Indiquez un motif')
                return Promise.reject()
              }
              return annulation.mutateAsync({ id: s.id, motif })
            },
          }),
      },
    ].filter(Boolean) as { key: string; label: string }[]
  }

  return { menu, enCours: action.isPending || annulation.isPending }
}

/** Détail d'une session avec sa courbe de puissance (MeterValues). */
export function SessionDrawer({ id, onFermer }: { id: number | null; onFermer: () => void }) {
  const { peut } = useAuth()
  const { data } = useQuery({
    queryKey: ['session', id],
    queryFn: () => fetchSession(id!),
    enabled: id !== null,
    refetchInterval: (q) => (q.state.data?.session.etat === 'en_cours' ? 10_000 : false),
  })
  const s = data?.session
  const mesures = data?.mesures ?? []

  return (
    <Drawer open={id !== null} onClose={onFermer} width={640} title={s ? `Session #${s.id}` : 'Session'}>
      {s && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="État"><Statut valeur={s.etat} libelles={ETAT_SESSION_LABELS} couleurs={ETAT_SESSION_COLORS} /></Descriptions.Item>
            <Descriptions.Item label="Origine">{ORIGINE_SESSION_LABELS[s.origine]}{s.badgeUid && <Tag style={{ marginLeft: 6 }}>{s.badgeUid}</Tag>}</Descriptions.Item>
            <Descriptions.Item label="Client">{peut('utilisateurs') ? <Link to={`/utilisateurs/${s.userId}`}>{s.userNom}</Link> : s.userNom}</Descriptions.Item>
            <Descriptions.Item label="Véhicule">{s.vehicule ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Borne"><Link to={`/bornes/${s.borneId}`}>{s.borneNom}</Link></Descriptions.Item>
            <Descriptions.Item label="Connecteur">{s.typeConnecteur}</Descriptions.Item>
            <Descriptions.Item label="Début">{formatDate(s.dateDebut)}</Descriptions.Item>
            <Descriptions.Item label="Fin">{formatDate(s.dateFin)}</Descriptions.Item>
            <Descriptions.Item label="Durée">{formatDuree(s.dureeMinutes)}</Descriptions.Item>
            <Descriptions.Item label="Énergie">{formatEnergie(s.energieKwh)}</Descriptions.Item>
            <Descriptions.Item label="Tarif">{s.tarifNom ?? 'Prix au kWh de la borne'}</Descriptions.Item>
            <Descriptions.Item label="Montant"><Typography.Text strong>{formatMontant(s.prix)}</Typography.Text></Descriptions.Item>
            {s.paiementStatut && (
              <Descriptions.Item label="Paiement"><Statut valeur={s.paiementStatut} libelles={STATUT_PAIEMENT_LABELS} couleurs={STATUT_PAIEMENT_COLORS} /></Descriptions.Item>
            )}
            {s.pourcentageBatterie !== null && (
              <Descriptions.Item label="Batterie"><Progress percent={s.pourcentageBatterie} size="small" style={{ width: 140 }} /></Descriptions.Item>
            )}
            {s.tempsRestantMinutes !== null && <Descriptions.Item label="Temps restant">{formatDuree(s.tempsRestantMinutes)}</Descriptions.Item>}
            {s.motifAnnulation && <Descriptions.Item label="Motif d'annulation" span={2}>{s.motifAnnulation}</Descriptions.Item>}
          </Descriptions>
          {s.factureId && peut('paiements') && (
            <Button icon={<FilePdfOutlined />} onClick={() => telechargerFacture(s.factureId!, `facture-${s.id}`)}>Facture PDF</Button>
          )}
          {mesures.length > 1 ? (
            <ReactECharts
              notMerge
              style={{ height: 300 }}
              option={{
                tooltip: { trigger: 'axis' },
                legend: { top: 0 },
                grid: { left: 44, right: 44, top: 36, bottom: 28 },
                xAxis: { type: 'category', data: mesures.map((m) => enFuseau(m.t).format('HH:mm')) },
                yAxis: [
                  { type: 'value', name: 'kW', splitLine: { lineStyle: { color: '#26262D' } } },
                  { type: 'value', name: '%', max: 100, splitLine: { show: false } },
                ],
                series: [
                  { name: 'Puissance (kW)', type: 'line', smooth: 0.3, smoothMonotone: 'x', showSymbol: false, data: mesures.map((m) => m.puissanceKw), itemStyle: { color: '#E5545F' }, areaStyle: { opacity: 0.1 } },
                  { name: 'Batterie (%)', type: 'line', yAxisIndex: 1, smooth: 0.3, smoothMonotone: 'x', showSymbol: false, data: mesures.map((m) => m.pourcentageBatterie), itemStyle: { color: '#E5545F' } },
                ],
              }}
            />
          ) : (
            <Empty description="Aucune télémétrie pour cette session" />
          )}
        </Space>
      )}
    </Drawer>
  )
}

/** Table paginée côté serveur des sessions, filtrable par borne / utilisateur / véhicule. */
export default function SessionsTable({ filtresFixes = {}, filtres = {} }: { filtresFixes?: Record<string, unknown>; filtres?: Record<string, unknown> }) {
  const { peut } = useAuth()
  const [pagination, setPagination] = useState({ cle: '', page: 1 })
  const [parPage, setParPage] = useState(20)
  const [detail, setDetail] = useState<number | null>(null)
  const { menu } = useActionsSession()
  const ecriture = peut('sessions', 'ecriture')

  // Retour à la première page quand les filtres changent.
  const cleFiltres = JSON.stringify(filtres)
  const page = pagination.cle === cleFiltres ? pagination.page : 1
  const setPage = (p: number) => setPagination({ cle: cleFiltres, page: p })

  const params = { ...filtresFixes, ...filtres, page, par_page: parPage }
  const { data, isLoading } = useQuery({
    queryKey: ['sessions', params],
    queryFn: () => fetchSessions(params),
    refetchInterval: 30_000,
  })

  const colonnes: ColumnsType<Session> = [
    { title: '#', dataIndex: 'id', width: 70, render: (id) => <a onClick={() => setDetail(id)}>#{id}</a> },
    { title: 'Début', dataIndex: 'dateDebut', render: (d) => formatDate(d) },
    ...(!('user_id' in filtresFixes)
      ? [{ title: 'Client', dataIndex: 'userNom', render: (n: string, s: Session) => (peut('utilisateurs') ? <Link to={`/utilisateurs/${s.userId}`}>{n}</Link> : n) }]
      : []),
    ...(!('borne_id' in filtresFixes)
      ? [{ title: 'Borne', dataIndex: 'borneNom', render: (n: string, s: Session) => <Link to={`/bornes/${s.borneId}`}>{n}</Link> }]
      : []),
    { title: 'Prise', dataIndex: 'typeConnecteur', responsive: ['lg'] },
    { title: 'Origine', dataIndex: 'origine', responsive: ['xl'], render: (o) => ORIGINE_SESSION_LABELS[o as Session['origine']] ?? o },
    { title: 'Durée', dataIndex: 'dureeMinutes', responsive: ['md'], render: (m) => formatDuree(m) },
    { title: 'Énergie', dataIndex: 'energieKwh', render: (v) => formatEnergie(v) },
    { title: 'Montant', dataIndex: 'prix', render: (v) => formatMontant(v) },
    {
      title: 'État',
      dataIndex: 'etat',
      render: (e, s) => (
        <Space size={4} direction="vertical">
          <Statut valeur={e} libelles={ETAT_SESSION_LABELS} couleurs={ETAT_SESSION_COLORS} />
          {s.paiementStatut === 'en_attente' && <Tag color="warning">Impayé</Tag>}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, s) =>
        ecriture && (s.etat === 'en_cours' || s.etat === 'en_pause') ? (
          <Dropdown menu={{ items: menu(s) }} trigger={['click']}>
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        ) : null,
    },
  ]

  return (
    <>
      <Table
        rowKey="id"
        size="middle"
        columns={colonnes}
        dataSource={data?.data}
        loading={isLoading}
        onRow={(s) => ({ onDoubleClick: () => setDetail(s.id) })}
        pagination={{
          current: page,
          pageSize: parPage,
          total: data?.meta.total,
          showSizeChanger: true,
          showTotal: (t) => `${t} session(s)`,
          onChange: (p, ps) => {
            setPage(p)
            setParPage(ps)
          },
        }}
        scroll={{ x: 900 }}
      />
      <SessionDrawer id={detail} onFermer={() => setDetail(null)} />
    </>
  )
}
