import { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Checkbox, Col, Form, Input, InputNumber, Row, Select, Space, Switch, Table, Tabs, Tag, Typography, Upload } from 'antd'
import { SaveOutlined, SendOutlined, UploadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, fetchParametres, fetchPermissions, testerNotification, televerserLogo, updateParametres, updatePermissions } from '../api'
import { useAuth } from '../auth'
import { EnTete } from '../components/commun'
import { GRAVITE_LABELS, MODULE_LABELS, NIVEAU_LABELS, ROLE_LABELS } from '../format'
import type { GraviteAlerte, Module, Niveau, Parametres, Role } from '../types'

const FUSEAUX = ['Africa/Tunis', 'Africa/Algiers', 'Africa/Casablanca', 'Europe/Paris', 'Europe/London', 'UTC', 'Asia/Dubai', 'America/New_York']
const CANAUX = ['email', 'sms', 'push'] as const
const COULEUR_NIVEAU: Record<Niveau, string> = { aucun: 'default', lecture: 'processing', ecriture: 'success' }

function MatriceDroits() {
  const { user, rafraichir } = useAuth()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const modifiable = user?.role === 'super_admin'
  const { data } = useQuery({ queryKey: ['permissions'], queryFn: fetchPermissions })
  const [brouillon, setMatrice] = useState<Record<Role, Record<Module, Niveau>>>()
  const matrice = brouillon ?? data?.matrice

  const enregistrement = useMutation({
    mutationFn: () => updatePermissions(matrice!),
    onSuccess: () => {
      setMatrice(undefined)
      message.success('Matrice des droits enregistrée')
      queryClient.invalidateQueries({ queryKey: ['permissions'] })
      void rafraichir()
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  if (!data || !matrice) return null
  const roles = data.roles

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="Matrice des permissions (RBAC)"
        description="Lecture : consultation du module. Écriture : création, modification et actions. Le super administrateur garde toujours tous les droits. Le client n'accède qu'à son espace personnel."
      />
      <Table
        size="small"
        rowKey="module"
        pagination={false}
        scroll={{ x: 1000 }}
        dataSource={(Object.keys(data.modules) as Module[]).map((module) => ({ module }))}
        columns={[
          { title: 'Module', dataIndex: 'module', fixed: 'left', width: 200, render: (m: Module) => <strong>{MODULE_LABELS[m]}</strong> },
          ...roles.map((role) => ({
            title: ROLE_LABELS[role],
            key: role,
            width: 130,
            render: (_: unknown, { module }: { module: Module }) =>
              modifiable && role !== 'super_admin' ? (
                <Select
                  size="small"
                  variant="borderless"
                  value={matrice[role][module]}
                  style={{ width: 110 }}
                  onChange={(v: Niveau) => setMatrice({ ...matrice, [role]: { ...matrice[role], [module]: v } })}
                  options={(Object.keys(NIVEAU_LABELS) as Niveau[]).map((n) => ({ value: n, label: <Tag color={COULEUR_NIVEAU[n]}>{NIVEAU_LABELS[n]}</Tag> }))}
                />
              ) : (
                <Tag color={COULEUR_NIVEAU[matrice[role][module]]}>{NIVEAU_LABELS[matrice[role][module]]}</Tag>
              ),
          })),
        ]}
      />
      {modifiable && <Button type="primary" icon={<SaveOutlined />} loading={enregistrement.isPending} onClick={() => enregistrement.mutate()}>Enregistrer la matrice</Button>}
    </Space>
  )
}

/** Module 17 — paramètres système, TVA, tarifs, logo, emails, SMS, fuseaux horaires, langues. */
export default function ParametresPage() {
  const { peut } = useAuth()
  const ecriture = peut('parametres', 'ecriture')
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<Parametres>()
  const [test, setTest] = useState({ email: '', sms: '' })
  const { data } = useQuery({ queryKey: ['parametres'], queryFn: fetchParametres })

  useEffect(() => {
    if (data) form.setFieldsValue(data)
  }, [data, form])

  const sauvegarde = useMutation({
    mutationFn: (v: Partial<Parametres>) => updateParametres(v),
    onSuccess: () => {
      message.success('Paramètres enregistrés')
      queryClient.invalidateQueries({ queryKey: ['parametres'] })
      queryClient.invalidateQueries({ queryKey: ['plateforme'] })
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const logo = useMutation({
    mutationFn: televerserLogo,
    onSuccess: () => {
      message.success('Logo mis à jour')
      queryClient.invalidateQueries({ queryKey: ['parametres'] })
      queryClient.invalidateQueries({ queryKey: ['plateforme'] })
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const essai = useMutation({
    mutationFn: ({ canal, dest }: { canal: string; dest?: string }) => testerNotification(canal, dest),
    onSuccess: (r) => (r.statut === 'envoyee' ? message.success(r.message) : message.warning(r.message)),
    onError: (e) => message.error(errorMessage(e)),
  })

  const enregistrer = () => form.validateFields().then((v) => sauvegarde.mutate(v))
  const pied = ecriture && (
    <Button type="primary" icon={<SaveOutlined />} loading={sauvegarde.isPending} onClick={enregistrer} style={{ marginTop: 8 }}>
      Enregistrer
    </Button>
  )

  return (
    <div className="pile">
      <EnTete titre="Paramètres" />
      <Card size="small">
        <Form form={form} layout="vertical" disabled={!ecriture}>
          <Tabs
            items={[
              {
                key: 'general',
                label: 'Général',
                forceRender: true,
                children: (
                  <Row gutter={24}>
                    <Col xs={24} md={14}>
                      <Form.Item name="plateforme_nom" label="Nom de la plateforme" rules={[{ required: true }]}><Input /></Form.Item>
                      <Row gutter={12}>
                        <Col span={8}><Form.Item name="devise" label="Devise"><Input /></Form.Item></Col>
                        <Col span={8}>
                          <Form.Item name="langue" label="Langue">
                            <Select options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }]} />
                          </Form.Item>
                        </Col>
                        <Col span={8}><Form.Item name="fuseau_horaire" label="Fuseau horaire"><Select showSearch options={FUSEAUX.map((f) => ({ value: f, label: f }))} /></Form.Item></Col>
                      </Row>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        La langue règle les composants (dates, calendriers, pagination) et le sens d'écriture ; les dates sont affichées dans le fuseau choisi.
                      </Typography.Text>
                      <div>{pied}</div>
                    </Col>
                    <Col xs={24} md={10}>
                      <Typography.Text strong>Logo</Typography.Text>
                      <div style={{ margin: '8px 0 12px', padding: 16, border: '1px dashed #3A3A43', borderRadius: 8, textAlign: 'center', minHeight: 80 }}>
                        {data?.logoUrl ? <img src={data.logoUrl} alt="Logo" style={{ maxHeight: 80, maxWidth: '100%' }} /> : <Typography.Text type="secondary">Aucun logo</Typography.Text>}
                      </div>
                      <Upload accept="image/png,image/jpeg,image/webp" showUploadList={false} beforeUpload={(f) => { logo.mutate(f); return false }}>
                        <Button icon={<UploadOutlined />} loading={logo.isPending}>Changer le logo</Button>
                      </Upload>
                      <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>Affiché dans le menu et sur les factures PDF (PNG/JPG, 2 Mo max).</Typography.Text></div>
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'facturation',
                label: 'Facturation & TVA',
                forceRender: true,
                children: (
                  <div style={{ maxWidth: 560 }}>
                    <Form.Item name="tva_taux" label="Taux de TVA" extra="Appliqué aux nouvelles factures (prix affichés TTC)."><InputNumber min={0} max={100} addonAfter="%" /></Form.Item>
                    <Form.Item name="mentions_facture" label="Mentions légales des factures"><Input.TextArea rows={3} /></Form.Item>
                    <Typography.Paragraph type="secondary">Les grilles tarifaires se gèrent dans <a href="/tarification">Tarification</a>.</Typography.Paragraph>
                    {pied}
                  </div>
                ),
              },
              {
                key: 'notifications',
                label: 'Notifications',
                forceRender: true,
                children: (
                  <Row gutter={24}>
                    <Col xs={24} lg={12}>
                      <Typography.Title level={5}>Email</Typography.Title>
                      <Form.Item name="email_expediteur" label="Expéditeur" rules={[{ type: 'email' }]}><Input /></Form.Item>
                      <Form.Item name="email_alertes_destinataires" label="Destinataires des alertes" extra="Le technicien référent de la borne est ajouté automatiquement.">
                        <Select mode="tags" tokenSeparators={[',', ' ']} />
                      </Form.Item>
                      <Space.Compact style={{ width: '100%', marginBottom: 24 }}>
                        <Input placeholder="adresse de test" value={test.email} onChange={(e) => setTest({ ...test, email: e.target.value })} disabled={!ecriture} />
                        <Button icon={<SendOutlined />} disabled={!ecriture || !test.email} onClick={() => essai.mutate({ canal: 'email', dest: test.email })}>Tester</Button>
                      </Space.Compact>

                      <Typography.Title level={5}>SMS</Typography.Title>
                      <Row gutter={12}>
                        <Col span={6}><Form.Item name="sms_actif" label="Actif" valuePropName="checked"><Switch /></Form.Item></Col>
                        <Col span={9}><Form.Item name="sms_fournisseur" label="Fournisseur"><Select options={[{ value: 'log', label: 'Journal (dév.)' }, { value: 'twilio', label: 'Twilio' }, { value: 'ooredoo', label: 'Ooredoo' }, { value: 'tunisie_telecom', label: 'Tunisie Télécom' }]} /></Form.Item></Col>
                        <Col span={9}><Form.Item name="sms_expediteur" label="Expéditeur"><Input maxLength={11} /></Form.Item></Col>
                      </Row>
                      <Form.Item name="sms_api_key" label="Clé API"><Input.Password autoComplete="off" /></Form.Item>
                      <Form.Item name="sms_destinataires" label="Numéros d'astreinte"><Select mode="tags" tokenSeparators={[',', ' ']} /></Form.Item>
                      <Space.Compact style={{ width: '100%', marginBottom: 24 }}>
                        <Input placeholder="+216 …" value={test.sms} onChange={(e) => setTest({ ...test, sms: e.target.value })} disabled={!ecriture} />
                        <Button icon={<SendOutlined />} disabled={!ecriture || !test.sms} onClick={() => essai.mutate({ canal: 'sms', dest: test.sms })}>Tester</Button>
                      </Space.Compact>

                      <Typography.Title level={5}>Push</Typography.Title>
                      <Space>
                        <Form.Item name="push_actif" valuePropName="checked" noStyle><Switch /></Form.Item>
                        <Typography.Text>Notifications instantanées dans le back-office</Typography.Text>
                        <Button size="small" disabled={!ecriture} onClick={() => essai.mutate({ canal: 'push' })}>Tester</Button>
                      </Space>
                    </Col>
                    <Col xs={24} lg={12}>
                      <Typography.Title level={5}>Règles d'envoi par gravité</Typography.Title>
                      <Table
                        size="small"
                        pagination={false}
                        rowKey="g"
                        dataSource={(Object.keys(GRAVITE_LABELS) as GraviteAlerte[]).map((g) => ({ g }))}
                        columns={[
                          { title: 'Gravité', dataIndex: 'g', render: (g: GraviteAlerte) => GRAVITE_LABELS[g] },
                          {
                            title: 'Canaux',
                            key: 'c',
                            render: (_, { g }) => (
                              <Form.Item name={['notifications_regles', g]} noStyle>
                                <Checkbox.Group options={CANAUX.map((c) => ({ value: c, label: c.toUpperCase() }))} />
                              </Form.Item>
                            ),
                          },
                        ]}
                      />
                      <div style={{ marginTop: 16 }}>{pied}</div>
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'supervision',
                label: 'Supervision',
                forceRender: true,
                children: (
                  <div style={{ maxWidth: 480 }}>
                    <Form.Item name="seuil_temperature" label="Seuil d'alerte de surchauffe"><InputNumber min={30} max={120} addonAfter="°C" /></Form.Item>
                    <Form.Item name="delai_heartbeat_minutes" label="Borne déconnectée après" extra="Sans heartbeat pendant ce délai, la borne passe « déconnectée » et une alerte est levée.">
                      <InputNumber min={1} max={60} addonAfter="min" />
                    </Form.Item>
                    {pied}
                  </div>
                ),
              },
              {
                key: 'securite',
                label: 'Sécurité',
                forceRender: true,
                children: (
                  <div style={{ maxWidth: 560 }}>
                    <Space align="start">
                      <Form.Item name="deux_facteurs_personnel" valuePropName="checked" noStyle><Switch /></Form.Item>
                      <div>
                        <Typography.Text strong>Double authentification obligatoire pour le personnel</Typography.Text>
                        <div><Typography.Text type="secondary">Un code à 6 chiffres est envoyé par email à chaque connexion d'un membre du personnel.</Typography.Text></div>
                      </div>
                    </Space>
                    <div style={{ marginTop: 16 }}>{pied}</div>
                  </div>
                ),
              },
              { key: 'droits', label: 'Rôles & permissions', children: <MatriceDroits /> },
            ]}
          />
        </Form>
      </Card>
    </div>
  )
}
