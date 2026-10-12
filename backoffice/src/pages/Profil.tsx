import { useEffect } from 'react'
import { App, Button, Card, Col, Form, Input, Row, Space, Switch, Tag, Typography } from 'antd'
import { SafetyOutlined } from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { errorMessage, setDeuxFacteurs, storeUser, updateProfil } from '../api'
import { useAuth } from '../auth'
import { EnTete, QrCode } from '../components/commun'
import { ROLE_COLORS, ROLE_LABELS } from '../format'

/** Profil de l'utilisateur connecté (personnel ou client). */
export default function ProfilPage() {
  const { user, rafraichir } = useAuth()
  const { message } = App.useApp()
  const [infos] = Form.useForm()
  const [mdp] = Form.useForm()

  useEffect(() => {
    if (user) infos.setFieldsValue(user)
  }, [user, infos])

  const maj = useMutation({
    mutationFn: updateProfil,
    onSuccess: (u) => {
      storeUser(u)
      void rafraichir()
      message.success('Profil mis à jour')
      mdp.resetFields()
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  const deuxFacteurs = useMutation({
    mutationFn: setDeuxFacteurs,
    onSuccess: (u) => {
      storeUser(u)
      void rafraichir()
      message.success(u.deuxFacteurs ? 'Double authentification activée' : 'Double authentification désactivée')
    },
  })

  if (!user) return null

  return (
    <div className="pile">
      <EnTete titre="Mon profil" sousTitre={<Tag color={ROLE_COLORS[user.role]}>{ROLE_LABELS[user.role]}</Tag>} />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Informations" size="small">
            <Form form={infos} layout="vertical" onFinish={(v) => maj.mutate(v)}>
              <Row gutter={12}>
                <Col span={12}><Form.Item name="prenom" label="Prénom" rules={[{ required: true }]}><Input /></Form.Item></Col>
                <Col span={12}><Form.Item name="nom" label="Nom" rules={[{ required: true }]}><Input /></Form.Item></Col>
                <Col span={14}><Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item></Col>
                <Col span={10}><Form.Item name="telephone" label="Téléphone"><Input /></Form.Item></Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={maj.isPending}>Enregistrer</Button>
            </Form>
          </Card>
          <Card title="Mot de passe" size="small" style={{ marginTop: 16 }}>
            <Form form={mdp} layout="vertical" onFinish={(v) => maj.mutate(v)}>
              <Row gutter={12}>
                <Col span={12}><Form.Item name="motDePasseActuel" label="Mot de passe actuel" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item></Col>
                <Col span={12}><Form.Item name="nouveauMotDePasse" label="Nouveau mot de passe" rules={[{ required: true, min: 8 }]}><Input.Password autoComplete="new-password" /></Form.Item></Col>
              </Row>
              <Button htmlType="submit" loading={maj.isPending}>Changer le mot de passe</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={<Space><SafetyOutlined />Double authentification</Space>} size="small">
            <Space align="start">
              <Switch checked={!!user.deuxFacteurs} loading={deuxFacteurs.isPending} onChange={(v) => deuxFacteurs.mutate(v)} />
              <Typography.Text type="secondary">À chaque connexion, un code à 6 chiffres est envoyé à {user.email}.</Typography.Text>
            </Space>
          </Card>
          {user.role === 'client' && user.qrToken && (
            <Card title="Mon QR code" size="small" style={{ marginTop: 16 }} styles={{ body: { textAlign: 'center' } }}>
              <QrCode valeur={`borneapp://user/${user.qrToken}`} nom="mon-qr-borneapp" legende="Votre carte client : présentez-la en agence ou au service client pour être identifié (elle ne sert pas aux bornes)" />
            </Card>
          )}
        </Col>
      </Row>
    </div>
  )
}
