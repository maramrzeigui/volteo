import { App, Button, Card, Empty, List, Popconfirm, Tag, Typography } from 'antd'
import { IdcardOutlined, LockOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { espace } from '../../api'
import { Statut } from '../../components/commun'
import { STATUT_BADGE_COLORS, STATUT_BADGE_LABELS, formatDate } from '../../format'

export default function EspaceBadges() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['espace', 'badges'], queryFn: espace.badges })
  const blocage = useMutation({
    mutationFn: espace.bloquerBadge,
    onSuccess: () => { message.success('Badge bloqué. Contactez le service client pour un remplacement.'); queryClient.invalidateQueries({ queryKey: ['espace', 'badges'] }) },
  })

  return (
    <div className="pile">
      <Typography.Title level={3} style={{ margin: 0 }}>Mes badges RFID</Typography.Title>
      <Card>
        {data?.length ? (
          <List
            dataSource={data}
            renderItem={(b) => (
              <List.Item actions={b.statut === 'actif' ? [
                <Popconfirm key="b" title="Déclarer ce badge perdu ou volé ?" description="Il sera immédiatement refusé par toutes les bornes." onConfirm={() => blocage.mutate(b.id)}>
                  <Button danger icon={<LockOutlined />}>Perdu / volé</Button>
                </Popconfirm>,
              ] : []}>
                <List.Item.Meta
                  avatar={<IdcardOutlined style={{ fontSize: 28, color: '#E5545F' }} />}
                  title={<><span className="texte-mono">{b.uid}</span> {b.libelle && <Tag>{b.libelle}</Tag>}</>}
                  description={<><Statut valeur={b.statut} libelles={STATUT_BADGE_LABELS} couleurs={STATUT_BADGE_COLORS} /> Expire le {formatDate(b.dateExpiration, false)}</>}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="Aucun badge. Demandez-en un au service client." />
        )}
      </Card>
    </div>
  )
}
