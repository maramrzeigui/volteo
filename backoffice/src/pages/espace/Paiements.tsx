import { App, Button, Card, Col, Dropdown, Row, Statistic, Table, Tabs, Typography } from 'antd'
import { CreditCardOutlined, FilePdfOutlined, WalletOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, espace, telechargerFacture } from '../../api'
import { useAuth } from '../../auth'
import { Statut } from '../../components/commun'
import {
  METHODE_PAIEMENT_LABELS,
  STATUT_FACTURE_COLORS,
  STATUT_FACTURE_LABELS,
  STATUT_PAIEMENT_COLORS,
  STATUT_PAIEMENT_LABELS,
  formatDate,
  formatMontant,
} from '../../format'
import { BoutonRecharge } from './commun'
import { ModalePaiement, RetourPaiement } from '../../components/PaiementEnLigne'
import { useState } from 'react'
import { useSoldeEnDirect } from '../../hooks/useSoldeEnDirect'

/** Paiements du client : wallet, paiements différés, historique, factures PDF (§7 : lecture). */
export default function EspacePaiements() {
  const { rafraichir } = useAuth()
  const { solde } = useSoldeEnDirect()
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { data: paiements, isLoading } = useQuery({ queryKey: ['espace', 'paiements'], queryFn: espace.paiements })
  const { data: factures } = useQuery({ queryKey: ['espace', 'factures'], queryFn: espace.factures })

  const reglement = useMutation({
    mutationFn: ({ id, methode }: { id: number; methode: 'wallet' }) => espace.regler(id, methode),
    onSuccess: (r) => {
      message.success(r.message)
      void rafraichir()
      queryClient.invalidateQueries({ queryKey: ['espace'] })
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const [aRegler, setARegler] = useState<{ id: number; montant: number } | null>(null)
  const enAttente = (paiements ?? []).filter((p) => p.statut === 'en_attente')
  const du = enAttente.reduce((s, p) => s + p.montant, 0)

  return (
    <div className="pile">
      <RetourPaiement />
      {aRegler && <ModalePaiement ouvert objet={{ objet: 'reglement', paiementId: aRegler.id, montant: aRegler.montant }} onFermer={() => setARegler(null)} />}
      <Typography.Title level={3} style={{ margin: 0 }}>Paiements & factures</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card>
            <Statistic title="Solde du wallet" value={formatMontant(solde)} prefix={<WalletOutlined />} />
            <div style={{ marginTop: 12 }}><BoutonRecharge /></div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card>
            <Statistic title="Reste à payer" value={formatMontant(du)} valueStyle={{ color: du > 0 ? '#FF6B6B' : undefined }} />
            <Typography.Text type="secondary">{enAttente.length} paiement(s) différé(s) — solde insuffisant au moment de la recharge.</Typography.Text>
          </Card>
        </Col>
      </Row>
      <Card size="small">
        <Tabs
          items={[
            {
              key: 'paiements',
              label: 'Historique des paiements',
              children: (
                <Table rowKey="id" size="middle" loading={isLoading} dataSource={paiements} pagination={{ pageSize: 15, hideOnSinglePage: true }}
                  columns={[
                    { title: 'Date', dataIndex: 'date', render: (d) => formatDate(d) },
                    { title: 'Objet', dataIndex: 'objet' },
                    { title: 'Moyen', dataIndex: 'methode', responsive: ['md'], render: (m) => METHODE_PAIEMENT_LABELS[m] ?? m },
                    { title: 'Montant', dataIndex: 'montant', render: (m) => formatMontant(m) },
                    { title: 'Statut', dataIndex: 'statut', render: (s) => <Statut valeur={s} libelles={STATUT_PAIEMENT_LABELS} couleurs={STATUT_PAIEMENT_COLORS} /> },
                    {
                      title: '',
                      key: 'a',
                      render: (_, p) =>
                        p.statut === 'en_attente' && (
                          <Dropdown menu={{ items: [
                            { key: 'w', icon: <WalletOutlined />, label: 'Avec mon wallet', onClick: () => reglement.mutate({ id: p.id, methode: 'wallet' }) },
                            { key: 'c', icon: <CreditCardOutlined />, label: 'Carte bancaire, Flouci ou e-DINAR', onClick: () => setARegler({ id: p.id, montant: p.montant }) },
                          ] }}>
                            <Button size="small" type="primary" loading={reglement.isPending}>Régler</Button>
                          </Dropdown>
                        ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'factures',
              label: 'Factures',
              children: (
                <Table rowKey="id" size="middle" dataSource={factures} pagination={{ pageSize: 15, hideOnSinglePage: true }}
                  columns={[
                    { title: 'Numéro', dataIndex: 'numero', render: (n) => <span className="texte-mono">{n}</span> },
                    { title: 'Date', dataIndex: 'date', render: (d) => formatDate(d, false) },
                    { title: 'Montant TTC', dataIndex: 'montantTtc', render: (m) => formatMontant(m) },
                    { title: 'Statut', dataIndex: 'statut', render: (s) => <Statut valeur={s} libelles={STATUT_FACTURE_LABELS} couleurs={STATUT_FACTURE_COLORS} /> },
                    { title: '', key: 'pdf', render: (_, f) => <Button size="small" icon={<FilePdfOutlined />} onClick={() => telechargerFacture(f.id, f.numero, false)}>PDF</Button> },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
