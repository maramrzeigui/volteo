import { useState } from 'react'
import { Button, Modal, Space, Tag, Typography } from 'antd'
import { AimOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { espace } from '../../api'
import type { Borne } from '../../types'

/** Photo de la borne (ou dégradé de repli), avec le crédit exigé par la licence. */
function Photo({ borne, hauteur }: { borne: Borne; hauteur: number }) {
  return (
    <div className="borne-photo" style={{ height: hauteur, backgroundImage: borne.photoUrl ? `url(${borne.photoUrl})` : undefined }}>
      {borne.photoUrl && borne.photoCredit && <span className="borne-photo-credit">© {borne.photoCredit.split(' · ')[0]}</span>}
    </div>
  )
}

/**
 * « Disponibles maintenant » : cartes de même taille avec la photo de chaque borne,
 * et aperçu en popup transparente (identique à l'application mobile).
 */
export default function BornesDisponibles() {
  const navigate = useNavigate()
  const [apercu, setApercu] = useState<Borne | null>(null)
  const { data = [] } = useQuery({ queryKey: ['espace', 'bornes'], queryFn: espace.bornes })
  const libres = data.filter((b) => b.source !== 'publique' && b.etat === 'disponible')

  if (!libres.length) return null
  return (
    <section>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Disponibles maintenant</Typography.Title>
        <Button type="link" onClick={() => navigate('/espace/bornes')}>Tout voir</Button>
      </Space>
      <div className="grille-bornes">
        {libres.map((b) => (
          <button key={b.id} type="button" className="carte-borne-photo" onClick={() => setApercu(b)}>
            <Photo borne={b} hauteur={140} />
            <span className="carte-borne-pastilles">
              <Tag color="success">Disponible</Tag>
              <Tag icon={<ThunderboltOutlined />}>{b.puissanceKw} kW</Tag>
            </span>
            <span className="carte-borne-corps">
              <Typography.Text type="danger" className="carte-borne-type">{(b.puissanceKw ?? 0) >= 50 ? 'CHARGE RAPIDE' : 'CHARGE NORMALE'}</Typography.Text>
              <strong>{b.nom}</strong>
              <Typography.Text type="secondary" ellipsis>{b.adresse}</Typography.Text>
            </span>
          </button>
        ))}
      </div>

      <Modal open={!!apercu} onCancel={() => setApercu(null)} footer={null} width={460} centered className="apercu-verre" transitionName="">
        {apercu && (
          <>
            <Photo borne={apercu} hauteur={200} />
            <div style={{ padding: '18px 4px 4px' }}>
              <Tag color="success">Disponible</Tag>
              <Typography.Title level={3} style={{ margin: '8px 0 4px' }}>{apercu.nom}</Typography.Title>
              <Typography.Text type="secondary">{apercu.adresse}</Typography.Text>
              <div className="apercu-chiffres">
                <div><strong>{apercu.puissanceKw}</strong><span>kW max</span></div>
                <div><strong>{apercu.connecteurs?.filter((c) => c.etat === 'disponible').length ?? 0}/{apercu.connecteurs?.length ?? 0}</strong><span>prises libres</span></div>
              </div>
              <Space style={{ width: '100%' }} direction="vertical">
                <Button block size="large" type="primary" icon={<AimOutlined />} onClick={() => navigate(`/espace/trajet?borne=${apercu.id}`)}>Y aller</Button>
                <Button block size="large" onClick={() => navigate('/espace/carte')}>Voir sur la carte</Button>
              </Space>
            </div>
          </>
        )}
      </Modal>
    </section>
  )
}
