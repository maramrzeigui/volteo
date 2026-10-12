import { useEffect, useRef, useState } from 'react'
import { App } from 'antd'
import { useQueryClient } from '@tanstack/react-query'
import { getToken } from '../api'

export type EtatConnexion = 'connecte' | 'reconnexion' | 'hors_ligne'

interface Message {
  evenement: string
  donnees: Record<string, unknown>
}

/** Clés React Query rafraîchies pour chaque type d'événement. */
const INVALIDATIONS: Record<string, string[][]> = {
  'borne.maj': [['supervision'], ['bornes'], ['borne'], ['stats']],
  'session.maj': [['supervision'], ['sessions'], ['session'], ['stats'], ['espace']],
  'alerte.nouvelle': [['alertes'], ['stats'], ['supervision'], ['alertes-ouvertes']],
  'firmware.maj': [['deploiements'], ['borne']],
  'ocpp.connexion': [['supervision']],
}

/**
 * Module 4 — mises à jour automatiques : WebSocket vers le relais temps réel
 * du serveur OCPP. Chaque événement invalide les données concernées ; les
 * alertes et notifications push s'affichent en toast.
 */
export function useTempsReel(actif: boolean, afficherAlertes: boolean): EtatConnexion {
  const [etat, setEtat] = useState<EtatConnexion>('hors_ligne')
  const queryClient = useQueryClient()
  const { notification } = App.useApp()
  const enAttente = useRef(new Set<string>())
  const minuterie = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!actif) return
    let ws: WebSocket | null = null
    let tentative = 0
    let ferme = false
    let relance: number | undefined

    // Regroupe les invalidations (une borne envoie un heartbeat toutes les 30 s).
    const invalider = (cles: string[][]) => {
      cles.forEach((c) => enAttente.current.add(JSON.stringify(c)))
      window.clearTimeout(minuterie.current)
      minuterie.current = window.setTimeout(() => {
        enAttente.current.forEach((c) => queryClient.invalidateQueries({ queryKey: JSON.parse(c) }))
        enAttente.current.clear()
      }, 800)
    }

    const connecter = () => {
      const token = getToken()
      if (!token) return
      const protocole = window.location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${protocole}://${window.location.host}/live?token=${encodeURIComponent(token)}`)

      ws.onopen = () => {
        tentative = 0
        setEtat('connecte')
      }
      ws.onmessage = (e) => {
        let message: Message
        try {
          message = JSON.parse(e.data as string) as Message
        } catch {
          return
        }
        const cles = INVALIDATIONS[message.evenement]
        if (cles) invalider(cles)

        if (afficherAlertes && message.evenement === 'alerte.nouvelle') {
          const d = message.donnees as { gravite: string; message: string; borneNom: string }
          notification[d.gravite === 'critique' ? 'error' : d.gravite === 'warning' ? 'warning' : 'info']({
            message: `Alerte — ${d.borneNom ?? 'borne'}`,
            description: d.message,
            placement: 'bottomRight',
            duration: 8,
          })
        }
      }
      ws.onclose = (e) => {
        if (ferme || e.code === 4401) {
          setEtat('hors_ligne')
          return
        }
        setEtat('reconnexion')
        tentative += 1
        relance = window.setTimeout(connecter, Math.min(30_000, 1000 * 2 ** tentative))
      }
    }

    connecter()

    return () => {
      ferme = true
      window.clearTimeout(relance)
      window.clearTimeout(minuterie.current)
      ws?.close()
    }
  }, [actif, afficherAlertes, queryClient, notification])

  return actif ? etat : 'hors_ligne'
}
