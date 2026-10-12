import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Badge, Button, Card, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { Breakpoint } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EditOutlined, EyeOutlined, PlusOutlined, QrcodeOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons'
import { ModaleEtiquette } from '../components/EtiquetteBorne'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { desactiverBorne, errorMessage, fetchBornes, reactiverBorne } from '../api'
import { useAuth } from '../auth'
import BorneForm from '../components/BorneForm'
import { EnTete, Statut } from '../components/commun'
import { ETAT_BORNE_COLORS, ETAT_BORNE_LABELS, ETAT_CONNECTEUR_COLORS, formatRelatif } from '../format'
import type { Borne, EtatBorne } from '../types'

/** Module 2 — liste des bornes : ajouter, modifier, désactiver, géolocaliser, affecter. */
export default function BornesPage() {
  const { peut, user } = useAuth()
  const ecriture = peut('bornes', 'ecriture')
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [etat, setEtat] = useState<EtatBorne>()
  const [edition, setEdition] = useState<Borne | null>(null)
  const [qr, setQr] = useState<Borne | null>(null)
  const [ouvert, setOuvert] = useState(false)

  const { data, isLoading } = useQuery({ queryKey: ['bornes', { q, etat }], queryFn: () => fetchBornes({ q, etat }) })

  const bascule = useMutation({
    mutationFn: (b: Borne) => (b.etat === 'hors_service' ? reactiverBorne(b.id) : desactiverBorne(b.id)),
    onSuccess: (r) => {
      message.success(r.message)
      queryClient.invalidateQueries({ queryKey: ['bornes'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const colonnes: ColumnsType<Borne> = [
    {
      title: 'Borne',
      dataIndex: 'nom',
      sorter: (a, b) => a.nom.localeCompare(b.nom),
      render: (_, b) => (
        <div>
          <a onClick={() => navigate(`/bornes/${b.id}`)}>{b.nom}</a>
          <div className="texte-mono" style={{ color: 'var(--texte-doux)' }}>{b.reference}</div>
        </div>
      ),
    },
    { title: 'Site', dataIndex: 'site', responsive: ['lg'], render: (s, b) => s ?? b.adresse },
    ...(user?.role === 'super_admin'
      ? [{ title: 'Station', dataIndex: 'stationNom', responsive: ['md'] as Breakpoint[], render: (n: string | null) => n ?? <Typography.Text type="secondary">—</Typography.Text> }]
      : []),
    {
      title: 'État',
      dataIndex: 'etat',
      render: (e: EtatBorne, b) => (
        <Space size={4}>
          <Statut valeur={e} libelles={ETAT_BORNE_LABELS} couleurs={ETAT_BORNE_COLORS} />
          {!!b.alertesOuvertes && <Badge count={b.alertesOuvertes} size="small" title="Alertes ouvertes" />}
        </Space>
      ),
    },
    {
      title: 'Admin',
      responsive: ['md'],
      render: (_, b) => {
        const a = b.responsables?.admin
        return a
          ? <div style={{ lineHeight: 1.3 }}><Typography.Text strong>{a.nom}</Typography.Text><br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{a.email}</Typography.Text></div>
          : <Typography.Text type="secondary">Non attribué</Typography.Text>
      },
    },
    { title: 'Modèle', responsive: ['xl'], render: (_, b) => `${b.fabricant ?? ''} ${b.modele ?? ''}` },
    { title: 'Puissance', dataIndex: 'puissanceKw', sorter: (a, b) => a.puissanceKw - b.puissanceKw, render: (p) => `${p} kW` },
    {
      title: 'Connecteurs',
      dataIndex: 'connecteurs',
      responsive: ['md'],
      render: (cs: Borne['connecteurs']) => (
        <Space size={2} wrap>
          {cs.map((c) => <Tag key={c.id} color={ETAT_CONNECTEUR_COLORS[c.etat]}>{c.type}</Tag>)}
        </Space>
      ),
    },
    { title: 'Tarif', dataIndex: 'tarifLibelle', responsive: ['lg'] },
    { title: 'Firmware', dataIndex: 'versionFirmware', responsive: ['xl'], render: (v, b) => <Typography.Text className="texte-mono">{v} · OCPP {b.versionOcpp}</Typography.Text> },
    { title: 'Heartbeat', dataIndex: 'dernierHeartbeat', responsive: ['md'], render: (d, b) => <Badge status={b.enLigne ? 'success' : 'error'} text={formatRelatif(d)} /> },
    {
      title: '',
      key: 'actions',
      width: 150,
      render: (_, b) => (
        <Space size={4}>
          <Tooltip title="Fiche"><Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/bornes/${b.id}`)} /></Tooltip>
          <Tooltip title="QR code à coller sur la borne"><Button size="small" icon={<QrcodeOutlined />} onClick={() => setQr(b)} /></Tooltip>
          {ecriture && (
            <>
              <Tooltip title="Modifier"><Button size="small" icon={<EditOutlined />} onClick={() => { setEdition(b); setOuvert(true) }} /></Tooltip>
              <Tooltip title={b.etat === 'hors_service' ? 'Réactiver' : 'Désactiver'}>
                <Button
                  size="small"
                  danger={b.etat !== 'hors_service'}
                  icon={b.etat === 'hors_service' ? <UndoOutlined /> : <StopOutlined />}
                  onClick={() =>
                    modal.confirm({
                      title: b.etat === 'hors_service' ? `Réactiver ${b.nom} ?` : `Désactiver ${b.nom} ?`,
                      content: b.etat === 'hors_service' ? 'La borne redevient disponible à la recharge.' : 'La borne passe hors service et ses connecteurs deviennent indisponibles.',
                      okButtonProps: { danger: b.etat !== 'hors_service' },
                      onOk: () => bascule.mutateAsync(b),
                    })
                  }
                />
              </Tooltip>
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="pile">
      <ModaleEtiquette borne={qr} onFermer={() => setQr(null)} />
      <EnTete
        titre="Bornes"
        sousTitre={`${data?.length ?? 0} borne(s) du réseau`}
        actions={ecriture && <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEdition(null); setOuvert(true) }}>Nouvelle borne</Button>}
      />
      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search placeholder="Nom, référence, adresse, n° série" allowClear onSearch={setQ} style={{ width: 300 }} />
          <Select allowClear placeholder="État" style={{ width: 180 }} value={etat} onChange={setEtat}
            options={(Object.keys(ETAT_BORNE_LABELS) as EtatBorne[]).map((e) => ({ value: e, label: ETAT_BORNE_LABELS[e] }))} />
        </Space>
        <Table rowKey="id" columns={colonnes} dataSource={data} loading={isLoading} size="middle" pagination={{ pageSize: 20, hideOnSinglePage: true }} />
      </Card>
      <BorneForm borne={edition} ouvert={ouvert} onFermer={() => setOuvert(false)} />
    </div>
  )
}
