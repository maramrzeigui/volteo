import { useState } from 'react'
import { ModalePaiement, RetourPaiement } from '../../components/PaiementEnLigne'
import { App, Button, Card, Col, Dropdown, Popconfirm, Row, Space, Tag, Typography } from 'antd'
import { CheckOutlined, CreditCardOutlined, WalletOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, espace } from '../../api'
import { useAuth } from '../../auth'
import { formatDate, formatMontant } from '../../format'

export default function EspaceAbonnement() {
  const { rafraichir } = useAuth()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { data: formules } = useQuery({ queryKey: ['espace', 'abonnements'], queryFn: espace.abonnements })
  const { data: actuel } = useQuery({ queryKey: ['espace', 'souscription'], queryFn: espace.souscription })

  const invalider = () => { void rafraichir(); queryClient.invalidateQueries({ queryKey: ['espace'] }) }
  const souscription = useMutation({
    mutationFn: ({ id, methode }: { id: number; methode: 'wallet' | 'carte' }) => espace.souscrire(id, methode),
    onSuccess: (s) => { message.success(`Bienvenue dans la formule ${s.abonnementNom} !`); invalider() },
    onError: (e) => message.error(errorMessage(e)),
  })
  const [aPayer, setAPayer] = useState<{ id: number; montant: number; nom: string } | null>(null)
  const resiliation = useMutation({ mutationFn: espace.resilier, onSuccess: (r) => { message.success(r.message); invalider() } })

  return (
    <div className="pile">
      <RetourPaiement />
      {aPayer && <ModalePaiement ouvert objet={{ objet: 'abonnement', abonnementId: aPayer.id, montant: aPayer.montant, nom: aPayer.nom }} onFermer={() => setAPayer(null)} />}
      <Typography.Title level={3} style={{ margin: 0 }}>Mon abonnement</Typography.Title>
      {actuel && (
        <Card>
          <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>{actuel.abonnementNom} <Tag color="success">Actif</Tag></Typography.Title>
              <Typography.Text type="secondary">
                Du {formatDate(actuel.dateDebut, false)} au {formatDate(actuel.dateFin, false)} · {actuel.renouvellementAuto ? 'renouvellement automatique' : 'ne sera pas renouvelé'}
              </Typography.Text>
            </div>
            {actuel.renouvellementAuto && (
              <Popconfirm title="Arrêter le renouvellement automatique ?" description="Votre abonnement reste valable jusqu'à sa date de fin." onConfirm={() => resiliation.mutate()}>
                <Button>Résilier</Button>
              </Popconfirm>
            )}
          </Space>
        </Card>
      )}
      <Row gutter={[16, 16]}>
        {(formules ?? []).map((f) => {
          const courant = actuel?.abonnementId === f.id
          return (
            <Col xs={24} md={8} key={f.id}>
              <Card style={{ height: '100%', borderColor: courant ? '#E5545F' : undefined }}>
                <Typography.Title level={4} style={{ marginTop: 0 }}>{f.nom}</Typography.Title>
                <Typography.Title level={2} style={{ margin: '8px 0' }}>{formatMontant(f.prixMensuel)}<Typography.Text type="secondary" style={{ fontSize: 14 }}> / mois</Typography.Text></Typography.Title>
                <Typography.Paragraph type="secondary">{f.description}</Typography.Paragraph>
                <ul style={{ paddingInlineStart: 18 }}>
                  <li>{f.remisePourcent} % de remise sur chaque recharge</li>
                  <li>{f.kwhInclus > 0 ? `${f.kwhInclus} kWh offerts chaque mois` : 'Sans kWh inclus'}</li>
                  <li>Sans engagement</li>
                </ul>
                {courant ? (
                  <Button block disabled icon={<CheckOutlined />}>Formule actuelle</Button>
                ) : (
                  <Dropdown disabled={!!actuel} menu={{ items: [
                    { key: 'w', icon: <WalletOutlined />, label: 'Payer avec mon wallet', onClick: () => souscription.mutate({ id: f.id, methode: 'wallet' }) },
                    { key: 'c', icon: <CreditCardOutlined />, label: 'Carte bancaire, Flouci ou e-DINAR', onClick: () => setAPayer({ id: f.id, montant: f.prixMensuel, nom: f.nom }) },
                  ] }}>
                    <Button block type="primary" loading={souscription.isPending}>{actuel ? 'Abonnement en cours' : 'Souscrire'}</Button>
                  </Dropdown>
                )}
              </Card>
            </Col>
          )
        })}
      </Row>
    </div>
  )
}
