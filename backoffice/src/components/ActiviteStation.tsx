import { useEffect, useRef, useState } from 'react'
import { App, Button, Empty, Input, Progress, Segmented, Table, Tag, Typography } from 'antd'
import { NotificationOutlined, SendOutlined, ThunderboltFilled } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { ecrireAPlateforme, errorMessage, messagesMaStation, messagesStation, repondreStation } from '../api'
import { ETAT_BORNE_COLORS, ETAT_BORNE_LABELS, formatDuree, formatMontant, formatNombre, formatRelatif } from '../format'
import type { BorneActivite, ClientStation, EtatBorne, MessageStation, RechargeStation } from '../types'

/** Recharges en cours sur les bornes de la station : client, borne, puissance et batterie en direct. */
export function RechargesEnDirect({ recharges }: { recharges: RechargeStation[] }) {
  if (!recharges.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Aucune recharge en cours" />
  return (
    <div className="recharges-direct">
      {recharges.map((r) => (
        <div key={r.id} className="recharge-direct-ligne">
          <span className="recharge-direct-icone"><ThunderboltFilled /></span>
          <div className="recharge-direct-infos">
            <strong>{r.client}</strong>
            <span>{r.borne} · {r.connecteur ?? '—'} · depuis {formatDuree(dayjs().diff(dayjs(r.debut), 'minute'))}</span>
            <Progress percent={r.batterie ?? 0} showInfo={false} size="small" strokeColor="#E5545F" trailColor="#2A2A31" />
          </div>
          <div className="recharge-direct-chiffres">
            <strong>{formatNombre(r.puissanceKw, 1)} kW</strong>
            <span>{formatNombre(r.energieKwh, 1)} kWh · {formatMontant(r.prix)}</span>
            {r.etat === 'en_pause' ? <Tag color="warning">En pause</Tag> : r.batterie != null && <span>{r.batterie} %</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Puissance délivrée maintenant par chaque borne, rapportée à sa puissance maximale. */
export function PuissanceBornes({ bornes }: { bornes: BorneActivite[] }) {
  if (!bornes.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Aucune borne rattachée" />
  return (
    <div className="puissance-bornes">
      {bornes.map((b) => (
        <a key={b.id} href={`/bornes/${b.id}`} className="puissance-borne">
          <div className="puissance-borne-haut">
            <strong>{b.nom}</strong>
            <Tag color={ETAT_BORNE_COLORS[b.etat as EtatBorne]}>{ETAT_BORNE_LABELS[b.etat as EtatBorne] ?? b.etat}</Tag>
          </div>
          <Progress percent={b.puissanceKw ? Math.round((b.puissanceActuelleKw / b.puissanceKw) * 100) : 0} showInfo={false} strokeColor="#E5545F" trailColor="#2A2A31" />
          <div className="puissance-borne-bas">
            <span><b>{formatNombre(b.puissanceActuelleKw, 1)}</b> / {b.puissanceKw} kW</span>
            <span>{b.sessionsJour} recharge(s) aujourd’hui · {formatNombre(b.energieJourKwh, 1)} kWh</span>
            <span className={b.enLigne ? 'en-ligne' : 'hors-ligne'}>{b.enLigne ? '● connectée' : '● hors ligne'}</span>
          </div>
        </a>
      ))}
    </div>
  )
}

/** Clients ayant rechargé ce mois-ci sur les bornes de la station. */
export function ClientsStation({ clients }: { clients: ClientStation[] }) {
  return (
    <Table
      size="small"
      rowKey="id"
      pagination={{ pageSize: 8, hideOnSinglePage: true }}
      dataSource={clients}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Aucun client ce mois-ci" /> }}
      columns={[
        { title: 'Client', dataIndex: 'nom', render: (n: string, c) => <><strong>{n}</strong><br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{c.email}</Typography.Text></> },
        { title: 'Recharges', dataIndex: 'recharges', align: 'right' },
        { title: 'Énergie', dataIndex: 'energieKwh', align: 'right', render: (v: number) => `${formatNombre(v, 1)} kWh` },
        { title: 'Montant', dataIndex: 'montant', align: 'right', render: (v: number) => formatMontant(v) },
        { title: 'Dernière', dataIndex: 'derniere', render: (d: string) => formatRelatif(d) },
      ]}
    />
  )
}

/**
 * Messagerie entre Volteo et une station. `stationId` : vue du super-admin (répond à cette station) ;
 * sans `stationId` : vue de la station (écrit à Volteo).
 */
export function Messagerie({ stationId }: { stationId?: number }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const plateforme = stationId != null
  const cle = ['messagerie', stationId ?? 'moi']
  const [texte, setTexte] = useState('')
  const [categorie, setCategorie] = useState<'message' | 'demande'>('message')
  const bas = useRef<HTMLDivElement>(null)
  const { data: messages } = useQuery({
    queryKey: cle,
    queryFn: () => (plateforme ? messagesStation(stationId) : messagesMaStation()),
    refetchInterval: 15_000,
  })
  const envoi = useMutation({
    mutationFn: () => (plateforme ? repondreStation(stationId, texte.trim()) : ecrireAPlateforme(texte.trim(), categorie)),
    onSuccess: () => {
      setTexte('')
      void queryClient.invalidateQueries({ queryKey: cle })
      void queryClient.invalidateQueries({ queryKey: ['stations'] })
    },
    onError: (e) => message.error(errorMessage(e)),
  })
  useEffect(() => {
    bas.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const moi = (m: MessageStation) => m.dePlateforme === plateforme

  return (
    <div className="messagerie">
      <div className="messagerie-fil">
        {!messages?.length && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={plateforme ? 'Aucun échange avec cette station' : 'Écrivez à Volteo : question, demande de borne, de formule…'} />
        )}
        {messages?.map((m) => (
          <div key={m.id} className={`message-bulle${moi(m) ? ' moi' : ''}${m.categorie === 'annonce' ? ' annonce' : ''}`}>
            {m.categorie === 'annonce' && <span className="message-etiquette"><NotificationOutlined /> Annonce Volteo</span>}
            {m.categorie === 'demande' && <span className="message-etiquette">Demande</span>}
            <p>{m.contenu}</p>
            <span className="message-meta">{m.auteur} · {dayjs(m.date).format('DD/MM HH:mm')}{moi(m) && m.lu ? ' · lu' : ''}</span>
          </div>
        ))}
        <div ref={bas} />
      </div>
      <form className="messagerie-saisie" onSubmit={(e) => { e.preventDefault(); if (texte.trim()) envoi.mutate() }}>
        {!plateforme && (
          <Segmented size="small" value={categorie} onChange={(v) => setCategorie(v as 'message' | 'demande')}
            options={[{ label: 'Message', value: 'message' }, { label: 'Demande', value: 'demande' }]} />
        )}
        <div className="messagerie-ligne">
          <Input.TextArea value={texte} onChange={(e) => setTexte(e.target.value)} autoSize={{ minRows: 1, maxRows: 4 }} maxLength={3000}
            placeholder={plateforme ? 'Répondre à la station…' : 'Votre message à Volteo…'}
            onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); if (texte.trim()) envoi.mutate() } }} />
          <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={envoi.isPending} disabled={!texte.trim()} />
        </div>
      </form>
    </div>
  )
}
