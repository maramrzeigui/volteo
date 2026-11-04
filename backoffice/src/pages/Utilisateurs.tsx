import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Badge, Button, Card, Col, Form, Input, Modal, Row, Segmented, Select, Space, Switch, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EditOutlined, EyeOutlined, PlusOutlined, SafetyOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createUser, errorMessage, fetchStations, fetchUsers, updateUser } from '../api'
import { useAuth } from '../auth'
import { EnTete } from '../components/commun'
import { ROLE_COLORS, ROLE_LABELS, formatDate, formatMontant, formatRelatif } from '../format'
import type { AdminUser, Role } from '../types'

export function UserForm({ user, ouvert, onFermer }: { user: AdminUser | null; ouvert: boolean; onFermer: () => void }) {
  const [form] = Form.useForm()
  const { message } = App.useApp()
  const { user: moi } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!ouvert) return
    form.resetFields()
    // Une station ne crée que son personnel (technicien par défaut) ; la plateforme, n'importe quel compte.
    form.setFieldsValue(user ?? { role: moi?.station ? 'technicien' : 'client', actif: true })
  }, [ouvert, user, form])

  const sauvegarde = useMutation({
    mutationFn: (v: Partial<AdminUser> & { password?: string }) => (user ? updateUser(user.id, v) : createUser(v)),
    onSuccess: () => {
      message.success(user ? 'Utilisateur modifié' : 'Utilisateur créé')
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user'] })
      onFermer()
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const roles = (Object.keys(ROLE_LABELS) as Role[])
    .filter((r) => (r !== 'super_admin' && r !== 'fabricant') || moi?.role === 'super_admin')
    .filter((r) => !moi?.station || r !== 'client')
  const roleChoisi = Form.useWatch('role', form)
  const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: fetchStations, enabled: ouvert && moi?.role === 'super_admin' })

  return (
    <Modal open={ouvert} title={user ? `Modifier ${user.prenom} ${user.nom}` : 'Nouvel utilisateur'} onCancel={onFermer} onOk={() => form.submit()} confirmLoading={sauvegarde.isPending} okText="Enregistrer" destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => sauvegarde.mutate(v)}>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="prenom" label="Prénom" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={12}><Form.Item name="nom" label="Nom" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={14}><Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item></Col>
          <Col span={10}><Form.Item name="telephone" label="Téléphone"><Input /></Form.Item></Col>
          <Col span={14}>
            <Form.Item name="role" label="Rôle" rules={[{ required: true }]}>
              <Select disabled={user?.id === moi?.id} options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
            </Form.Item>
            {/* Super-admin : rattacher le personnel à une station cliente (vide = personnel Volteo). */}
            {moi?.role === 'super_admin' && roleChoisi && !['client', 'super_admin', 'fabricant'].includes(roleChoisi) && (
              <Form.Item name="stationId" label="Station">
                <Select allowClear placeholder="Personnel Volteo (toutes les stations)" options={(stations?.stations ?? []).map((st) => ({ value: st.id, label: st.nom }))} />
              </Form.Item>
            )}
          </Col>
          <Col span={10}><Form.Item name="actif" label="Compte actif" valuePropName="checked"><Switch disabled={user?.id === moi?.id} /></Form.Item></Col>
          <Col span={24}>
            <Form.Item name="password" label={user ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe initial'} extra={!user && 'Laisser vide pour générer un mot de passe aléatoire (réinitialisation par email).'} rules={[{ min: 8, message: '8 caractères minimum' }]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}

/** Module 6 — clients, techniciens, exploitants, administrateurs. */
export default function UtilisateursPage() {
  const { peut } = useAuth()
  const ecriture = peut('utilisateurs', 'ecriture')
  const navigate = useNavigate()
  const [type, setType] = useState<'tous' | 'clients' | 'personnel'>('tous')
  const [role, setRole] = useState<Role>()
  const [q, setQ] = useState('')
  const [actif, setActif] = useState<boolean>()
  const [edition, setEdition] = useState<AdminUser | null>(null)
  const [ouvert, setOuvert] = useState(false)

  const params = { type: type === 'tous' ? undefined : type, role, q, actif: actif === undefined ? undefined : actif ? 1 : 0 }
  const { data, isLoading } = useQuery({ queryKey: ['users', params], queryFn: () => fetchUsers(params) })

  const colonnes: ColumnsType<AdminUser> = [
    {
      title: 'Utilisateur',
      key: 'nom',
      sorter: (a, b) => (a.nom ?? '').localeCompare(b.nom ?? ''),
      render: (_, u) => (
        <div>
          <a onClick={() => navigate(`/utilisateurs/${u.id}`)}>{u.prenom} {u.nom}</a>
          {u.deuxFacteurs && <Tooltip title="Double authentification activée"><SafetyOutlined style={{ marginLeft: 6, color: '#F2A3AA' }} /></Tooltip>}
          <div style={{ fontSize: 12, color: 'var(--texte-doux)' }}>{u.email}</div>
        </div>
      ),
    },
    { title: 'Téléphone', dataIndex: 'telephone', responsive: ['lg'] },
    { title: 'Rôle', dataIndex: 'role', render: (r: Role) => <Tag color={ROLE_COLORS[r]}>{ROLE_LABELS[r]}</Tag> },
    { title: 'Statut', dataIndex: 'actif', render: (a: boolean) => <Badge status={a ? 'success' : 'default'} text={a ? 'Actif' : 'Désactivé'} /> },
    { title: 'Wallet', dataIndex: 'soldeWallet', responsive: ['md'], sorter: (a, b) => a.soldeWallet - b.soldeWallet, render: (v, u) => (u.role === 'client' ? formatMontant(v) : '—') },
    { title: 'Sessions', dataIndex: 'nbSessions', responsive: ['md'], sorter: (a, b) => (a.nbSessions ?? 0) - (b.nbSessions ?? 0) },
    { title: 'Dernière connexion', dataIndex: 'derniereConnexion', responsive: ['xl'], render: (d) => (d ? <Tooltip title={formatDate(d)}>{formatRelatif(d)}</Tooltip> : '—') },
    { title: 'Inscrit le', dataIndex: 'createdAt', responsive: ['xl'], render: (d) => formatDate(d, false) },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_, u) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/utilisateurs/${u.id}`)} />
          {ecriture && <Button size="small" icon={<EditOutlined />} onClick={() => { setEdition(u); setOuvert(true) }} />}
        </Space>
      ),
    },
  ]

  return (
    <div className="pile">
      <EnTete
        titre="Utilisateurs"
        sousTitre={`${data?.length ?? 0} compte(s)`}
        actions={ecriture && <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEdition(null); setOuvert(true) }}>Nouvel utilisateur</Button>}
      />
      <Card size="small">
        <Space wrap style={{ marginBottom: 12 }}>
          <Segmented value={type} onChange={(v) => setType(v as typeof type)} options={[{ label: 'Tous', value: 'tous' }, { label: 'Clients', value: 'clients' }, { label: 'Personnel', value: 'personnel' }]} />
          <Input.Search placeholder="Nom, email, téléphone" allowClear onSearch={setQ} style={{ width: 240 }} />
          <Select allowClear placeholder="Rôle" style={{ width: 190 }} value={role} onChange={setRole} options={(Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
          <Select allowClear placeholder="Statut" style={{ width: 140 }} value={actif} onChange={setActif} options={[{ value: true, label: 'Actifs' }, { value: false, label: 'Désactivés' }]} />
        </Space>
        <Table rowKey="id" size="middle" columns={colonnes} dataSource={data} loading={isLoading} pagination={{ pageSize: 20, hideOnSinglePage: true, showTotal: (t) => `${t} utilisateur(s)` }} />
      </Card>
      <UserForm user={edition} ouvert={ouvert} onFermer={() => setOuvert(false)} />
    </div>
  )
}
