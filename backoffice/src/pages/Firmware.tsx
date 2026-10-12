import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, App, Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Tooltip, Typography, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload'
import { CloudUploadOutlined, DeleteOutlined, InboxOutlined, RocketOutlined, RollbackOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deployerFirmware, errorMessage, fetchBornes, fetchDeploiements, fetchFirmwares, rollbackFirmware, supprimerFirmware, televerserFirmware } from '../api'
import { useAuth } from '../auth'
import { EnTete, Statut } from '../components/commun'
import { STATUT_DEPLOIEMENT_COLORS, STATUT_DEPLOIEMENT_LABELS, formatDate, formatTaille } from '../format'
import type { Deploiement, Firmware } from '../types'

/** Module 13 — firmware : téléversement, déploiement (OCPP UpdateFirmware), historique, versions, rollback. */
export default function FirmwarePage() {
  const { peut } = useAuth()
  const ecriture = peut('firmware', 'ecriture')
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [formUp] = Form.useForm()
  const [formDep] = Form.useForm()
  const [televersement, setTeleversement] = useState(false)
  const [deploiement, setDeploiement] = useState<Firmware | null>(null)

  const { data: firmwares, isLoading } = useQuery({ queryKey: ['firmwares'], queryFn: fetchFirmwares })
  const { data: deploiements } = useQuery({ queryKey: ['deploiements', {}], queryFn: () => fetchDeploiements(), refetchInterval: 8_000 })
  const { data: bornes } = useQuery({ queryKey: ['bornes', {}], queryFn: () => fetchBornes(), enabled: !!deploiement })
  const invalider = () => ['firmwares', 'deploiements', 'bornes'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }))

  const envoi = useMutation({
    mutationFn: (v: { fichier: UploadFile[]; version: string; fabricant?: string; modele?: string; notes?: string }) =>
      televerserFirmware({ ...v, fichier: v.fichier[0].originFileObj as File }),
    onSuccess: (f) => {
      message.success(`Firmware ${f.version} téléversé (SHA-256 ${f.checksum.slice(0, 12)}…)`)
      setTeleversement(false)
      formUp.resetFields()
      invalider()
    },
    onError: (e) => message.error(errorMessage(e, 'Échec du téléversement')),
  })
  const lancement = useMutation({
    mutationFn: (v: { borneIds: number[] }) => deployerFirmware(deploiement!.id, v.borneIds),
    onSuccess: (r) => {
      modal.info({ title: r.message, content: <ul>{r.resultats.map((x) => <li key={x.borneId} style={{ color: x.ok ? undefined : '#FF6B6B' }}>{x.message}</li>)}</ul> })
      setDeploiement(null)
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const retour = useMutation({
    mutationFn: rollbackFirmware,
    onSuccess: (r) => {
      message.success(r.message)
      invalider()
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const suppression = useMutation({ mutationFn: supprimerFirmware, onSuccess: () => { message.success('Firmware supprimé'); invalider() }, onError: (e) => message.error(errorMessage(e)) })

  const colonnesFw: ColumnsType<Firmware> = [
    { title: 'Version', dataIndex: 'version', render: (v) => <Tag color="processing" style={{ fontSize: 13 }}>{v}</Tag> },
    { title: 'Matériel', key: 'm', render: (_, f) => `${f.fabricant ?? 'Tous'} ${f.modele ?? ''}` },
    { title: 'Fichier', dataIndex: 'nomFichier', render: (n, f) => <><span className="texte-mono">{n}</span><div style={{ fontSize: 12, color: 'var(--texte-doux)' }}>{formatTaille(f.taille)} · <Tooltip title={f.checksum}>SHA-256 {f.checksum.slice(0, 10)}…</Tooltip></div></> },
    { title: 'Notes de version', dataIndex: 'notes', ellipsis: true, responsive: ['lg'] },
    { title: 'Déploiements', dataIndex: 'nbDeploiements', align: 'center', responsive: ['md'] },
    { title: 'Téléversé', dataIndex: 'createdAt', responsive: ['md'], render: (d, f) => <>{formatDate(d, false)}<div style={{ fontSize: 12, color: 'var(--texte-doux)' }}>{f.auteur}</div></> },
    {
      title: '',
      key: 'a',
      width: 140,
      render: (_, f) =>
        ecriture && (
          <Space size={4}>
            <Button size="small" type="primary" icon={<RocketOutlined />} onClick={() => { formDep.resetFields(); setDeploiement(f) }}>Déployer</Button>
            <Popconfirm title="Supprimer ce firmware ?" onConfirm={() => suppression.mutate(f.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
          </Space>
        ),
    },
  ]

  const colonnesDep: ColumnsType<Deploiement> = [
    { title: 'Date', dataIndex: 'createdAt', render: (d) => formatDate(d) },
    { title: 'Borne', dataIndex: 'borneNom', render: (n, d) => <Link to={`/bornes/${d.borneId}`}>{n}</Link> },
    { title: 'Version', key: 'v', render: (_, d) => <>{d.versionPrecedente ?? '?'} → <strong>{d.version}</strong>{d.rollback && <Tag color="default" style={{ marginLeft: 6 }}>Rollback</Tag>}</> },
    { title: 'Statut', dataIndex: 'statut', render: (s) => <Statut valeur={s} libelles={STATUT_DEPLOIEMENT_LABELS} couleurs={STATUT_DEPLOIEMENT_COLORS} /> },
    { title: 'Message', dataIndex: 'message', responsive: ['lg'], ellipsis: true },
    { title: 'Lancé par', dataIndex: 'lanceParNom', responsive: ['xl'] },
    {
      title: '',
      key: 'a',
      width: 110,
      render: (_, d) =>
        ecriture && ['installe', 'echec'].includes(d.statut) && d.versionPrecedente && (
          <Button size="small" icon={<RollbackOutlined />} onClick={() => modal.confirm({ title: `Revenir à la version ${d.versionPrecedente} sur ${d.borneNom} ?`, content: 'La version précédente sera redéployée via OCPP UpdateFirmware.', onOk: () => retour.mutateAsync(d.id) })}>
            Rollback
          </Button>
        ),
    },
  ]

  return (
    <div className="pile">
      <EnTete titre="Firmware" actions={ecriture && <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setTeleversement(true)}>Téléverser une version</Button>} />
      <Card size="small">
        <Tabs
          items={[
            { key: 'versions', label: 'Versions', children: <Table rowKey="id" size="middle" columns={colonnesFw} dataSource={firmwares} loading={isLoading} pagination={false} scroll={{ x: 900 }} /> },
            { key: 'historique', label: 'Historique des déploiements', children: <Table rowKey="id" size="middle" columns={colonnesDep} dataSource={deploiements} pagination={{ pageSize: 20, hideOnSinglePage: true }} scroll={{ x: 900 }} /> },
          ]}
        />
      </Card>

      <Modal open={televersement} title="Téléverser un firmware" onCancel={() => setTeleversement(false)} onOk={() => formUp.submit()} confirmLoading={envoi.isPending} okText="Téléverser" destroyOnHidden>
        <Form form={formUp} layout="vertical" onFinish={(v) => envoi.mutate(v)}>
          <Form.Item name="fichier" valuePropName="fileList" getValueFromEvent={(e) => e?.fileList?.slice(-1)} rules={[{ required: true, message: 'Fichier requis' }]}>
            <Upload.Dragger beforeUpload={() => false} maxCount={1}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p>Binaire du firmware (200 Mo max)</p>
            </Upload.Dragger>
          </Form.Item>
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="version" label="Version" rules={[{ required: true }]}><Input placeholder="1.9.0" /></Form.Item>
            <Form.Item name="fabricant" label="Fabricant"><Input placeholder="ABB" /></Form.Item>
            <Form.Item name="modele" label="Modèle"><Input placeholder="Terra AC" /></Form.Item>
          </Space>
          <Form.Item name="notes" label="Notes de version"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal open={!!deploiement} title={`Déployer la version ${deploiement?.version}`} onCancel={() => setDeploiement(null)} onOk={() => formDep.submit()} confirmLoading={lancement.isPending} okText="Lancer le déploiement">
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Chaque borne reçoit une commande OCPP UpdateFirmware avec un lien de téléchargement signé (24 h). La progression remonte via FirmwareStatusNotification." />
        <Form form={formDep} layout="vertical" onFinish={(v) => lancement.mutate(v)}>
          <Form.Item name="borneIds" label="Bornes cibles" rules={[{ required: true }]}>
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              options={(bornes ?? []).map((b) => ({
                value: b.id,
                label: `${b.nom} (${b.fabricant} · v${b.versionFirmware})`,
                disabled: !!deploiement?.fabricant && b.fabricant !== deploiement.fabricant,
              }))}
            />
          </Form.Item>
          {deploiement?.fabricant && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Seules les bornes {deploiement.fabricant} sont sélectionnables.</Typography.Text>}
        </Form>
      </Modal>
    </div>
  )
}
