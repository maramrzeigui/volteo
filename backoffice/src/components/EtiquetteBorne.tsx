import { useRef } from 'react'
import { Button, Modal, Space } from 'antd'
import { PrinterOutlined } from '@ant-design/icons'
import { QRCodeSVG } from 'qrcode.react'
import type { Borne } from '../types'
import { SymboleMarque } from './Marque'
import { usePlateforme } from '../hooks/usePlateforme'

/** Adresse publique du site (VITE_URL_PUBLIQUE), à défaut celle de la page ouverte. */
export const URL_PUBLIQUE = (import.meta.env.VITE_URL_PUBLIQUE as string | undefined)?.replace(/\/$/, '') || window.location.origin

/**
 * Lien du QR code d'une borne : un lien web ordinaire, que l'appareil photo de n'importe quel
 * téléphone sait ouvrir. Il mène à la fiche de cette borne (connexion d'abord si besoin).
 * Il est fixe : il ne dépend que de la référence, donc il existe dès la création de la borne.
 */
export const lienQrBorne = (b: Pick<Borne, 'reference'>) => `${URL_PUBLIQUE}/b/${b.reference}`

/** Étiquette à imprimer et à coller sur la borne : logo, nom, référence et QR code. */
export function EtiquetteBorne({ borne }: { borne: Pick<Borne, 'reference' | 'nom' | 'adresse' | 'puissanceKw'> }) {
  const { nom: plateforme } = usePlateforme()
  return (
    <div className="etiquette-borne">
      <div className="etiquette-haut">
        <SymboleMarque taille={40} />
        <div>
          <strong>{plateforme}</strong>
          <span>Recharge pour véhicules électriques</span>
        </div>
      </div>
      <div className="etiquette-titre">Scannez pour recharger</div>
      <div className="etiquette-qr">
        <QRCodeSVG value={lienQrBorne(borne)} size={220} level="M" marginSize={1} fgColor="#0B0B0E" />
      </div>
      <ol className="etiquette-etapes">
        <li>Ouvrez l’appareil photo de votre téléphone</li>
        <li>Visez ce code et touchez le lien : la borne s’ouvre</li>
        <li>Choisissez la prise et touchez « Démarrer »</li>
      </ol>
      <div className="etiquette-borne-infos">
        <strong>{borne.nom}</strong>
        <span>{borne.adresse}</span>
        <span className="etiquette-ref">{borne.reference} · {borne.puissanceKw} kW</span>
      </div>
      <div className="etiquette-pied">Pas d’application ? Rechargez avec votre badge {plateforme}.</div>
    </div>
  )
}

/** Ouvre l'étiquette dans une fenêtre d'impression (impression papier ou « Enregistrer en PDF »). */
function imprimer(element: HTMLElement | null, titre: string) {
  if (!element) return
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('')
  const fenetre = window.open('', '_blank', 'width=520,height=820')
  if (!fenetre) return
  fenetre.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titre}</title>${styles}
    <style>@page { size: A6; margin: 8mm } body { margin: 0; background: #fff; display: grid; place-items: center; min-height: 100vh }</style>
    </head><body>${element.outerHTML}</body></html>`)
  fenetre.document.close()
  fenetre.onload = () => {
    fenetre.focus()
    fenetre.print()
  }
}

/** Fenêtre « QR code de la borne » : aperçu de l'étiquette et impression. */
export function ModaleEtiquette({ borne, onFermer }: { borne: Borne | null; onFermer: () => void }) {
  const zone = useRef<HTMLDivElement>(null)
  return (
    <Modal open={!!borne} onCancel={onFermer} footer={null} centered width={440} title={borne ? `QR code · ${borne.nom}` : ''} destroyOnHidden>
      {borne && (
        <Space direction="vertical" size={16} style={{ width: '100%', alignItems: 'center' }}>
          <div ref={zone}><EtiquetteBorne borne={borne} /></div>
          <Button type="primary" size="large" icon={<PrinterOutlined />} onClick={() => imprimer(zone.current?.firstElementChild as HTMLElement, `Étiquette ${borne.reference}`)}>
            Imprimer l’étiquette
          </Button>
        </Space>
      )}
    </Modal>
  )
}
