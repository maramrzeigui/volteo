import { useRef } from 'react'
import { Alert, Button, Card, Col, Descriptions, Empty, Modal, Progress, Row, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd'
import { PrinterOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { QRCodeSVG } from 'qrcode.react'
import { SymboleMarque } from './Marque'
import { formatDate } from '../format'
import { adresseCourte, lienQrBatterie, type Batterie, type Passeport } from '../lib/volteoChain'

/** Passeport d'une batterie, lu dans la blockchain : NFT, propriétaire, santé et recharges certifiées. */
export function VuePasseport({ passeport }: { passeport: Passeport }) {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type={passeport.recyclee ? 'warning' : 'success'}
        showIcon
        icon={<SafetyCertificateOutlined />}
        message={passeport.recyclee ? 'Batterie déclarée recyclée' : `Batterie certifiée · NFT n° ${passeport.tokenId}`}
        description={
          <span>
            Données lues dans la blockchain (contrat <Typography.Text code>{adresseCourte(passeport.contrat)}</Typography.Text>) :
            personne ne peut les modifier, pas même Volteo.
          </span>
        }
      />
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card><Statistic title="État de santé (SoH)" value={passeport.soh} suffix="%" /><Progress percent={passeport.soh} showInfo={false} strokeColor="#2FBF71" /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Recharges certifiées" value={passeport.nbRecharges} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Énergie certifiée" value={passeport.energieTotaleKWh} precision={1} suffix="kWh" /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Cycles équivalents" value={passeport.cycles} precision={2} /></Card></Col>
      </Row>
      <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
        <Descriptions.Item label="Numéro de série">{passeport.numSerie}</Descriptions.Item>
        <Descriptions.Item label="Modèle">{passeport.modele}</Descriptions.Item>
        <Descriptions.Item label="Capacité">{passeport.capaciteKWh} kWh{passeport.chimie ? ` · ${passeport.chimie}` : ''}</Descriptions.Item>
        <Descriptions.Item label="Véhicule (VIN)">{passeport.vin || '—'}</Descriptions.Item>
        <Descriptions.Item label="Fabriquée le">{formatDate(passeport.dateFabrication)}</Descriptions.Item>
        <Descriptions.Item label="Propriétaire (portefeuille)"><Tooltip title={passeport.proprietaire}><Typography.Text code>{adresseCourte(passeport.proprietaire)}</Typography.Text></Tooltip></Descriptions.Item>
      </Descriptions>
      <Card title="Recharges certifiées par les stations agréées" size="small">
        <Table
          size="small"
          rowKey="sessionId"
          dataSource={passeport.recharges}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="Aucune recharge certifiée pour l’instant" /> }}
          scroll={{ x: true }}
          columns={[
            { title: 'Date', dataIndex: 'fin', render: (d: string) => formatDate(d) },
            { title: 'Station', dataIndex: 'nomStation', render: (n: string, r) => <Tooltip title={r.station}><Tag color="green">{n || adresseCourte(r.station)}</Tag></Tooltip> },
            { title: 'Borne', dataIndex: 'borne' },
            { title: 'Énergie', dataIndex: 'energieKWh', align: 'right', render: (e: number) => `${e.toFixed(2)} kWh` },
          ]}
        />
      </Card>
      {passeport.interventions.length > 0 && (
        <Card title="Interventions des garages agréés" size="small">
          <Table size="small" rowKey={(i) => i.date + i.type} dataSource={passeport.interventions} pagination={false}
            columns={[
              { title: 'Date', dataIndex: 'date', render: (d: string) => formatDate(d) },
              { title: 'Type', dataIndex: 'type' },
              { title: 'Description', dataIndex: 'description' },
            ]}
          />
        </Card>
      )}
    </Space>
  )
}

/** Étiquette à coller sur la batterie (QR du passeport public). Le code d'activation n'y figure jamais : il va sur la facture. */
export function EtiquetteBatterie({ batterie }: { batterie: Batterie }) {
  return (
    <div className="etiquette-borne">
      <div className="etiquette-haut">
        <SymboleMarque taille={40} />
        <div>
          <strong>Volteo Chain</strong>
          <span>Passeport de batterie certifié</span>
        </div>
      </div>
      <div className="etiquette-titre">Scannez pour vérifier</div>
      <div className="etiquette-qr">
        <QRCodeSVG value={lienQrBatterie(batterie.numSerie)} size={200} level="M" marginSize={1} fgColor="#0B0B0E" />
      </div>
      <div className="etiquette-borne-infos">
        <strong>{batterie.modele}</strong>
        <span className="etiquette-ref">{batterie.numSerie} · {batterie.capaciteKwh} kWh</span>
        {batterie.tokenId && <span>NFT n° {batterie.tokenId}</span>}
      </div>
      <div className="etiquette-pied">Passeport public et infalsifiable, lu dans la blockchain.</div>
    </div>
  )
}

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

export function ModaleEtiquetteBatterie({ batterie, onFermer }: { batterie: Batterie | null; onFermer: () => void }) {
  const zone = useRef<HTMLDivElement>(null)
  return (
    <Modal open={!!batterie} onCancel={onFermer} footer={null} centered width={440} title={batterie ? `Étiquette · ${batterie.numSerie}` : ''} destroyOnHidden>
      {batterie && (
        <Space direction="vertical" size={16} style={{ width: '100%', alignItems: 'center' }}>
          <div ref={zone}><EtiquetteBatterie batterie={batterie} /></div>
          <Button type="primary" size="large" icon={<PrinterOutlined />} onClick={() => imprimer(zone.current?.firstElementChild as HTMLElement, `Batterie ${batterie.numSerie}`)}>
            Imprimer l’étiquette
          </Button>
        </Space>
      )}
    </Modal>
  )
}
