import { useParams } from 'react-router-dom'
import { Button, Card, Result, Spin, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { errorMessage } from '../api'
import { SymboleMarque } from '../components/Marque'
import { VuePasseport } from '../components/PasseportBatterie'
import { passeportPublic } from '../lib/volteoChain'

/** Page ouverte en scannant le QR code d'une batterie : tout acheteur vérifie son historique, sans compte. */
export default function PasseportPublicPage() {
  const { numSerie = '' } = useParams()
  const { data, isLoading, error } = useQuery({ queryKey: ['passeport', numSerie], queryFn: () => passeportPublic(numSerie), retry: false })

  return (
    <div style={{ minHeight: '100vh', padding: '32px 16px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <SymboleMarque taille={40} />
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>Passeport de batterie</Typography.Title>
          <Typography.Text type="secondary">Volteo Chain · {numSerie}</Typography.Text>
        </div>
      </div>
      {isLoading ? (
        <Card><Spin /></Card>
      ) : error || !data ? (
        <Result
          status="warning"
          title="Batterie non certifiée"
          subTitle={`${errorMessage(error, 'Introuvable')}. Une batterie sans NFT peut être une contrefaçon.`}
          extra={<Button href="/">Volteo</Button>}
        />
      ) : (
        <VuePasseport passeport={data} />
      )}
    </div>
  )
}
