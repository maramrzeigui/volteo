import { useEffect, useState } from 'react'
import { Button, InputNumber, Modal, Spin } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, LockOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { errorMessage, espace } from '../api'
import { useAuth } from '../auth'
import { formatMontant } from '../format'
import type { MoyenPaiement } from '../types'
import Dialogue from './Dialogue'

type Objet = { objet: 'recharge_wallet' } | { objet: 'reglement'; paiementId: number; montant: number } | { objet: 'abonnement'; abonnementId: number; montant: number; nom: string }

const VISUEL: Record<MoyenPaiement, { titre: string; detail: string; logos: string[] }> = {
  carte: { titre: 'Carte bancaire', detail: 'CIB, Visa, Mastercard · 3-D Secure', logos: ['CIB', 'VISA', 'MC'] },
  flouci: { titre: 'Flouci', detail: 'Payez depuis l’application Flouci', logos: ['Flouci'] },
  edinar: { titre: 'e-DINAR / D17', detail: 'Carte e-DINAR de La Poste Tunisienne', logos: ['e-DINAR'] },
}

/**
 * Paiement en ligne : choix du moyen (carte bancaire, Flouci, e-DINAR), puis redirection
 * vers la page sécurisée du prestataire. Le résultat est vérifié par le serveur au retour.
 */
export function ModalePaiement({ ouvert, objet, onFermer }: { ouvert: boolean; objet: Objet; onFermer: () => void }) {
  const [moyen, setMoyen] = useState<MoyenPaiement>('carte')
  const [montant, setMontant] = useState(50)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { data } = useQuery({ queryKey: ['paiement', 'moyens'], queryFn: espace.moyensPaiement, enabled: ouvert })
  const moyens = data?.moyens ?? []
  const total = objet.objet === 'recharge_wallet' ? montant : objet.montant

  const payer = async () => {
    setEnvoi(true)
    setErreur(null)
    try {
      const t = await espace.payerEnLigne({
        objet: objet.objet,
        moyen,
        montant: objet.objet === 'recharge_wallet' ? montant : undefined,
        paiement_id: objet.objet === 'reglement' ? objet.paiementId : undefined,
        abonnement_id: objet.objet === 'abonnement' ? objet.abonnementId : undefined,
      })
      if (t.url) window.location.assign(t.url)
    } catch (e) {
      setErreur(errorMessage(e))
      setEnvoi(false)
    }
  }

  return (
    <Modal open={ouvert} onCancel={onFermer} footer={null} centered width={480} className="dialogue-verre" destroyOnHidden>
      <div className="paiement">
        <h3>{objet.objet === 'recharge_wallet' ? 'Recharger mon wallet' : objet.objet === 'reglement' ? 'Régler ma recharge' : `Formule ${objet.nom}`}</h3>
        {objet.objet === 'recharge_wallet' ? (
          <>
            <div className="paiement-montants">
              {[20, 50, 100, 200].map((m) => (
                <button key={m} type="button" className={montant === m ? 'actif' : undefined} onClick={() => setMontant(m)}>{m} DT</button>
              ))}
            </div>
            <InputNumber min={5} max={1000} value={montant} onChange={(v) => setMontant(Number(v ?? 5))} suffix="DT" style={{ width: '100%' }} size="large" />
          </>
        ) : (
          <div className="paiement-total">{formatMontant(total)}</div>
        )}

        <span className="paiement-libelle">Moyen de paiement</span>
        <div className="paiement-moyens">
          {moyens.length === 0 && <Spin />}
          {moyens.map((m) => (
            <button key={m.moyen} type="button" className={`paiement-moyen${moyen === m.moyen ? ' actif' : ''}`} onClick={() => setMoyen(m.moyen)}>
              <span className="paiement-radio" />
              <span className="paiement-moyen-texte"><strong>{VISUEL[m.moyen].titre}</strong><small>{VISUEL[m.moyen].detail}</small></span>
              <span className="paiement-logos">{VISUEL[m.moyen].logos.map((l) => <b key={l} className={`logo-${l.toLowerCase().replace(/[^a-z]/g, '')}`}>{l}</b>)}</span>
            </button>
          ))}
        </div>
        {erreur && <div className="connexion-message erreur">{erreur}</div>}
        <Button type="primary" size="large" block loading={envoi} disabled={!moyens.length} icon={<LockOutlined />} onClick={payer} className="paiement-payer">
          Payer {formatMontant(total)}
        </Button>
        <p className="paiement-note">
          Vous allez être redirigé vers la page sécurisée {moyens.find((m) => m.moyen === moyen)?.passerelle === 'test' ? 'de test (aucun débit réel)' : 'de votre banque ou du prestataire'}. Volteo ne voit jamais votre numéro de carte.
        </p>
      </div>
    </Modal>
  )
}

/** Au retour de la page de paiement (?transaction=…) : vérification puis message de résultat. */
export function RetourPaiement() {
  const [params, setParams] = useSearchParams()
  const reference = params.get('transaction')
  const { rafraichir } = useAuth()
  const queryClient = useQueryClient()
  const [resultat, setResultat] = useState<{ ok: boolean; texte: string } | null>(null)

  useEffect(() => {
    if (!reference) return
    let essais = 0
    let fini = false
    const verifier = async () => {
      try {
        const t = await espace.transactionEnLigne(reference)
        if (t.statut === 'en_cours' && essais++ < 10) return void setTimeout(verifier, 1500)
        if (fini) return
        fini = true
        setParams({}, { replace: true })
        void rafraichir()
        void queryClient.invalidateQueries({ queryKey: ['espace'] })
        setResultat(
          t.statut === 'reussie'
            ? { ok: true, texte: `Paiement de ${formatMontant(t.montant)} confirmé.${t.objet === 'recharge_wallet' ? ` Nouveau solde : ${formatMontant(t.soldeWallet)}.` : ''}` }
            : { ok: false, texte: t.statut === 'en_cours' ? 'Le paiement est encore en cours de validation par votre banque.' : 'Le paiement n’a pas abouti. Aucun montant n’a été débité.' },
        )
      } catch (e) {
        setResultat({ ok: false, texte: errorMessage(e) })
      }
    }
    void verifier()
    return () => {
      fini = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference])

  return (
    <Dialogue
      open={!!resultat}
      icone={resultat?.ok ? <CheckCircleFilled /> : <CloseCircleFilled />}
      titre={resultat?.ok ? 'Paiement réussi' : 'Paiement non abouti'}
      texte={resultat?.texte}
      confirmer="Compris"
      onConfirmer={() => setResultat(null)}
    />
  )
}
