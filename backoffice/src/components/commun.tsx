import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { App, Button, Card, Dropdown, Image, Skeleton, Space, Tag, Typography } from 'antd'
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined } from '@ant-design/icons'
import { QRCodeCanvas } from 'qrcode.react'
import { errorMessage, urlLocale } from '../api'
import { ChiffreAnime } from '../motion'
import { Sparkline } from './Premium'
import { C } from '../theme'

/** Titre de page avec sous-titre et actions. */
export function EnTete({
  titre,
  sousTitre,
  actions,
  surtitre,
}: {
  titre: ReactNode
  sousTitre?: ReactNode
  actions?: ReactNode
  /** Pastille rouge en majuscules au-dessus du titre. */
  surtitre?: ReactNode
}) {
  return (
    <div className="en-tete-page">
      <div>
        {surtitre && <span className="surtitre">{surtitre}</span>}
        {surtitre && <br />}
        {/* Clé = texte : un titre chargé après l'animation d'entrée remplace bien l'ancien. */}
        <Typography.Title key={typeof titre === 'string' ? titre : undefined} level={3} style={{ margin: 0 }}>
          {titre}
        </Typography.Title>
        {sousTitre && <span className="en-tete-sous-titre">{sousTitre}</span>}
      </div>
      {actions && <Space wrap>{actions}</Space>}
    </div>
  )
}

/** Tag coloré à partir de tables de libellés / couleurs. */
export function Statut<T extends string>({
  valeur,
  libelles,
  couleurs,
}: {
  valeur: T | null | undefined
  libelles: Record<string, string>
  couleurs: Record<string, string>
}) {
  if (!valeur) return <Typography.Text type="secondary">—</Typography.Text>
  return <Tag color={couleurs[valeur] ?? 'default'}>{libelles[valeur] ?? valeur}</Tag>
}

/** Indicateur KPI : valeur animée, icône teintée, pied d'information. */
export function Kpi({
  titre,
  valeur,
  suffixe,
  icone,
  couleur = C.rougeVif,
  chargement,
  pied,
  tendance,
}: {
  titre: string
  valeur: ReactNode
  suffixe?: ReactNode
  icone?: ReactNode
  couleur?: string
  chargement?: boolean
  pied?: ReactNode
  /** Valeurs récentes (ex. 14 derniers jours) affichées en mini-courbe. */
  tendance?: number[]
}) {
  return (
    <Card size="small" className="kpi" style={{ '--kpi-couleur': couleur } as CSSProperties}>
      {chargement ? (
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      ) : (
        <>
          <div className="kpi-tete">
            <span className="kpi-titre">{titre}</span>
            {icone && (
              <span className="kpi-icone" style={{ color: couleur, background: `${couleur}17` }}>
                {icone}
              </span>
            )}
          </div>
          <div className="kpi-valeur">
            <ChiffreAnime valeur={valeur} />
            {suffixe && <span className="kpi-suffixe">{suffixe}</span>}
          </div>
          {tendance && tendance.length > 1 && (
            <div className="kpi-tendance">
              <Sparkline valeurs={tendance} couleur={couleur} hauteur={36} />
            </div>
          )}
          {pied && <div className="kpi-pied">{pied}</div>}
        </>
      )}
    </Card>
  )
}

/** Menu d'export PDF / Excel / CSV (modules 14 et 18). */
export function ExportMenu({ onExport, disabled }: { onExport: (format: 'pdf' | 'xlsx' | 'csv') => Promise<void>; disabled?: boolean }) {
  const { message } = App.useApp()
  const [chargement, setChargement] = useState(false)

  const exporter = async (format: 'pdf' | 'xlsx' | 'csv') => {
    setChargement(true)
    try {
      await onExport(format)
    } catch (e) {
      message.error(errorMessage(e, "Échec de l'export"))
    } finally {
      setChargement(false)
    }
  }

  return (
    <Dropdown
      disabled={disabled}
      menu={{
        items: [
          { key: 'pdf', icon: <FilePdfOutlined />, label: 'PDF', onClick: () => exporter('pdf') },
          { key: 'xlsx', icon: <FileExcelOutlined />, label: 'Excel (.xlsx)', onClick: () => exporter('xlsx') },
          { key: 'csv', icon: <FileTextOutlined />, label: 'CSV', onClick: () => exporter('csv') },
        ],
      }}
    >
      <Button icon={<DownloadOutlined />} loading={chargement}>
        Exporter
      </Button>
    </Dropdown>
  )
}

/** QR code téléchargeable en PNG. */
export function QrCode({ valeur, nom, taille = 180, legende }: { valeur: string; nom: string; taille?: number; legende?: ReactNode }) {
  const conteneur = useRef<HTMLDivElement>(null)

  const telecharger = () => {
    const canvas = conteneur.current?.querySelector('canvas')
    if (!canvas) return
    const lien = document.createElement('a')
    lien.href = canvas.toDataURL('image/png')
    lien.download = `${nom}.png`
    lien.click()
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div ref={conteneur} style={{ padding: 12, background: '#fff', borderRadius: 12, border: '1px solid var(--bordure)' }}>
        <QRCodeCanvas value={valeur} size={taille} marginSize={1} level="M" />
      </div>
      {legende && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{legende}</Typography.Text>}
      <Button size="small" icon={<DownloadOutlined />} onClick={telecharger}>
        Télécharger
      </Button>
    </div>
  )
}

/** Image servie par une route protégée (jeton Bearer). */
export function ImageProtegee({ url, alt, largeur = 120 }: { url: string; alt: string; largeur?: number }) {
  const [src, setSrc] = useState<string>()

  useEffect(() => {
    let actuel: string | undefined
    let annule = false
    urlLocale(url)
      .then((u) => {
        actuel = u
        if (!annule) setSrc(u)
      })
      .catch(() => setSrc(undefined))
    return () => {
      annule = true
      if (actuel) URL.revokeObjectURL(actuel)
    }
  }, [url])

  if (!src) return <Skeleton.Image active style={{ width: largeur, height: largeur }} />
  return <Image src={src} alt={alt} width={largeur} height={largeur} style={{ objectFit: 'cover', borderRadius: 10 }} />
}
