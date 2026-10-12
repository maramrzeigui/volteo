import type { ReactNode } from 'react'
import { Button, Modal } from 'antd'

type Props = {
  open: boolean
  icone: ReactNode
  titre: string
  texte?: ReactNode
  /** Bouton principal ; sans `annuler`, il est seul et pleine largeur (« Compris »). */
  confirmer: string
  annuler?: string
  chargement?: boolean
  onConfirmer: () => void
  onAnnuler?: () => void
}

/** Popup en verre de l'application mobile : pastille d'icône, titre, texte et une ou deux actions. */
export default function Dialogue({ open, icone, titre, texte, confirmer, annuler, chargement, onConfirmer, onAnnuler }: Props) {
  return (
    <Modal open={open} footer={null} closable={false} centered width={400} className="dialogue-verre" onCancel={onAnnuler ?? onConfirmer} destroyOnHidden>
      <div className="dialogue">
        <span className="dialogue-icone">{icone}</span>
        <h3>{titre}</h3>
        {texte && <p>{texte}</p>}
        <div className={`dialogue-actions${annuler ? '' : ' seul'}`}>
          {annuler && (
            <Button type="text" size="large" onClick={onAnnuler}>
              {annuler}
            </Button>
          )}
          <Button type="primary" size="large" loading={chargement} onClick={onConfirmer}>
            {confirmer}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
