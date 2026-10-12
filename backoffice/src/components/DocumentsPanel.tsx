import { useState } from 'react'
import { App, Button, DatePicker, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload'
import { DeleteOutlined, DownloadOutlined, EyeOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import {
  errorMessage,
  fetchBornes,
  fetchDocuments,
  supprimerDocument,
  telechargerDocument,
  televerserDocument,
  urlLocale,
} from '../api'
import { useAuth } from '../auth'
import { formatDate, formatTaille, TYPE_DOCUMENT_LABELS } from '../format'
import type { DocumentItem, TypeDocument } from '../types'

const COULEURS: Record<TypeDocument, string> = {
  notice: 'processing',
  photo: 'default',
  contrat: 'warning',
  plan: 'processing',
  garantie: 'success',
  diagnostic: 'processing',
  autre: 'default',
}

/** Module 16 — gestion documentaire (notices, photos, contrats, plans, garanties). */
export default function DocumentsPanel({ borneId }: { borneId?: number }) {
  const { peut } = useAuth()
  const ecriture = peut('documents', 'ecriture')
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [type, setType] = useState<TypeDocument>()
  const [q, setQ] = useState('')
  const [expirant, setExpirant] = useState(false)
  const [ouvert, setOuvert] = useState(false)
  const [apercu, setApercu] = useState<{ url: string; mime: string; titre: string } | null>(null)
  const [form] = Form.useForm()

  const params = { borne_id: borneId, type, q, expire_bientot: expirant ? 1 : undefined }
  const { data, isLoading } = useQuery({ queryKey: ['documents', params], queryFn: () => fetchDocuments(params) })
  const { data: bornes } = useQuery({ queryKey: ['bornes', {}], queryFn: () => fetchBornes(), enabled: ouvert && !borneId })

  const envoi = useMutation({
    mutationFn: (v: { fichier: UploadFile[]; type: string; titre: string; borneId?: number; dateExpiration?: Dayjs }) =>
      televerserDocument({
        fichier: v.fichier[0].originFileObj as File,
        type: v.type,
        titre: v.titre,
        borneId: borneId ?? v.borneId,
        dateExpiration: v.dateExpiration?.format('YYYY-MM-DD'),
      }),
    onSuccess: () => {
      message.success('Document ajouté')
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      setOuvert(false)
      form.resetFields()
    },
    onError: (e) => message.error(errorMessage(e, 'Échec du téléversement')),
  })

  const suppression = useMutation({
    mutationFn: supprimerDocument,
    onSuccess: () => {
      message.success('Document supprimé')
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const ouvrirApercu = async (d: DocumentItem) => {
    try {
      setApercu({ url: await urlLocale(`/admin/documents/${d.id}/telecharger`), mime: d.mime ?? '', titre: d.titre })
    } catch (e) {
      message.error(errorMessage(e, 'Aperçu indisponible'))
    }
  }

  const colonnes: ColumnsType<DocumentItem> = [
    {
      title: 'Document',
      dataIndex: 'titre',
      render: (t, d) => (
        <div>
          <Typography.Text strong>{t}</Typography.Text>
          <div style={{ fontSize: 12, color: 'var(--texte-doux)' }}>{d.nomFichier} · {formatTaille(d.taille)}</div>
        </div>
      ),
    },
    { title: 'Type', dataIndex: 'type', render: (t: TypeDocument) => <Tag color={COULEURS[t]}>{TYPE_DOCUMENT_LABELS[t]}</Tag> },
    ...(!borneId ? [{ title: 'Borne', dataIndex: 'borneNom', render: (n: string | null) => n ?? 'Général' }] : []),
    {
      title: 'Échéance',
      dataIndex: 'dateExpiration',
      render: (d: string | null) => {
        if (!d) return '—'
        const jours = dayjs(d).diff(dayjs(), 'day')
        return <Tag color={jours < 0 ? 'red' : jours <= 60 ? 'orange' : 'default'}>{formatDate(d, false)}</Tag>
      },
    },
    { title: 'Ajouté', dataIndex: 'createdAt', responsive: ['md'], render: (d, doc) => <>{formatDate(d, false)}<br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{doc.auteur ?? 'Borne (OCPP)'}</Typography.Text></> },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, d) => (
        <Space size={4}>
          {(d.mime?.startsWith('image/') || d.mime === 'application/pdf' || d.mime === 'text/plain') && (
            <Tooltip title="Aperçu"><Button size="small" icon={<EyeOutlined />} onClick={() => ouvrirApercu(d)} /></Tooltip>
          )}
          <Tooltip title="Télécharger"><Button size="small" icon={<DownloadOutlined />} onClick={() => telechargerDocument(d)} /></Tooltip>
          {ecriture && (
            <Popconfirm title="Supprimer ce document ?" onConfirm={() => suppression.mutate(d.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <>
      <Space wrap style={{ marginBottom: 12, justifyContent: 'space-between', width: '100%' }}>
        <Space wrap>
          <Input.Search placeholder="Rechercher" allowClear onSearch={setQ} style={{ width: 220 }} />
          <Select allowClear placeholder="Type" style={{ width: 160 }} value={type} onChange={setType}
            options={(Object.keys(TYPE_DOCUMENT_LABELS) as TypeDocument[]).map((t) => ({ value: t, label: TYPE_DOCUMENT_LABELS[t] }))} />
          <Button type={expirant ? 'primary' : 'default'} ghost={expirant} onClick={() => setExpirant((e) => !e)}>
            Échéance &lt; 60 jours
          </Button>
        </Space>
        {ecriture && <Button type="primary" icon={<UploadOutlined />} onClick={() => setOuvert(true)}>Ajouter un document</Button>}
      </Space>
      <Table rowKey="id" size="middle" columns={colonnes} dataSource={data} loading={isLoading} pagination={{ pageSize: 15, hideOnSinglePage: true }} />

      <Modal open={ouvert} title="Ajouter un document" onCancel={() => setOuvert(false)} onOk={() => form.submit()} confirmLoading={envoi.isPending} okText="Téléverser" destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={(v) => envoi.mutate(v)} initialValues={{ type: 'notice' }}>
          <Form.Item name="fichier" valuePropName="fileList" getValueFromEvent={(e) => e?.fileList?.slice(-1)} rules={[{ required: true, message: 'Fichier requis' }]}>
            <Upload.Dragger beforeUpload={() => false} maxCount={1}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p>Glissez un fichier ou cliquez (PDF, image, plan, 20 Mo max)</p>
            </Upload.Dragger>
          </Form.Item>
          <Form.Item name="titre" label="Titre" rules={[{ required: true }]}><Input /></Form.Item>
          <Space style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
            <Form.Item name="type" label="Type" rules={[{ required: true }]}>
              <Select options={(Object.keys(TYPE_DOCUMENT_LABELS) as TypeDocument[]).filter((t) => t !== 'diagnostic').map((t) => ({ value: t, label: TYPE_DOCUMENT_LABELS[t] }))} />
            </Form.Item>
            <Form.Item name="dateExpiration" label="Échéance (contrat, garantie)">
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          {!borneId && (
            <Form.Item name="borneId" label="Borne (facultatif)">
              <Select allowClear showSearch optionFilterProp="label" options={(bornes ?? []).map((b) => ({ value: b.id, label: b.nom }))} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal open={!!apercu} title={apercu?.titre} footer={null} width={900} onCancel={() => { if (apercu) URL.revokeObjectURL(apercu.url); setApercu(null) }}>
        {apercu?.mime.startsWith('image/') ? (
          <img src={apercu.url} alt={apercu.titre} style={{ width: '100%' }} />
        ) : (
          apercu && <iframe src={apercu.url} title={apercu.titre} style={{ width: '100%', height: '70vh', border: 0 }} />
        )}
      </Modal>
    </>
  )
}
