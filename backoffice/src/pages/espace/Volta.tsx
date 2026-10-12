import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Input, Space, Tag } from 'antd'
import { CalculatorOutlined, HourglassOutlined, PlusCircleOutlined, SendOutlined, ThunderboltOutlined, WalletOutlined } from '@ant-design/icons'
import LottieModule from 'lottie-react'
import robot from '../../assets/animations/assistant-robot.json'
import { useAuth } from '../../auth'
import { mouvementReduit } from '../../motion'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { errorMessage, espace } from '../../api'
import type { CarteAssistant, MessageVolta } from '../../types'
import IconeVolta from '../../components/IconeVolta'

// lottie-react est publié en CommonJS : selon le bundler, le composant est sous `.default`.
const Lottie = ((LottieModule as unknown as { default?: typeof LottieModule }).default ?? LottieModule) as typeof LottieModule

// Mêmes suggestions que l'écran d'accueil de Volta dans l'application.
const SUGGESTIONS = [
  { icone: <ThunderboltOutlined />, texte: 'Quelles bornes sont libres maintenant ?' },
  { icone: <CalculatorOutlined />, texte: 'Combien coûte une recharge de 20 à 80 % ?' },
  { icone: <WalletOutlined />, texte: 'Mon solde et mon abonnement' },
  { icone: <HourglassOutlined />, texte: 'Comment fonctionne la réservation ?' },
  { icone: <ThunderboltOutlined />, texte: 'وين نلقى بورن شحن سريع؟' },
]

/** Texte de Volta : **gras** et listes à puces, sans HTML injecté. */
function TexteRiche({ texte }: { texte: string }) {
  return (
    <>
      {texte.split('\n').map((ligne, i) => {
        const puce = /^\s*[-•]\s+/.test(ligne)
        const morceaux = ligne.replace(/^\s*[-•]\s+/, '').split(/(\*\*[^*]+\*\*)/g).map((m, j) =>
          m.startsWith('**') && m.endsWith('**') ? <strong key={j}>{m.slice(2, -2)}</strong> : <span key={j}>{m}</span>,
        )
        return ligne.trim() === '' ? <br key={i} /> : <p key={i} className={puce ? 'volta-puce' : undefined} dir="auto">{morceaux}</p>
      })}
    </>
  )
}

function Carte({ carte }: { carte: CarteAssistant }) {
  const titre = (carte.titre ?? carte.nom ?? '') as string
  return carte.borneId ? (
    <Link to={`/espace/bornes/${carte.borneId}`} className="volta-carte"><Tag color="error">Borne</Tag> {titre}</Link>
  ) : (
    <span className="volta-carte">{titre}</span>
  )
}

/** Volta, l'assistant de Volteo, sur le web : mêmes réponses et mêmes outils que dans l'application. */
export default function EspaceVolta() {
  const [messages, setMessages] = useState<MessageVolta[]>([])
  const [question, setQuestion] = useState('')
  const [conversation, setConversation] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const bas = useRef<HTMLDivElement>(null)
  const { data: etat, refetch } = useQuery({ queryKey: ['espace', 'volta'], queryFn: espace.etatVolta })

  useEffect(() => {
    if (messages.length || envoi) bas.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, envoi])

  const poser = async (texte: string) => {
    const q = texte.trim()
    if (!q || envoi) return
    setQuestion('')
    setErreur(null)
    setMessages((m) => [...m, { role: 'user', contenu: q }])
    setEnvoi(true)
    try {
      const r = await espace.poserQuestion(q, conversation)
      setConversation(r.conversationId)
      setMessages((m) => [...m, r.message])
      void refetch()
    } catch (e) {
      setErreur(errorMessage(e))
    } finally {
      setEnvoi(false)
    }
  }

  const { user } = useAuth()
  const indisponible = etat?.disponible === false
  // Question passée par une fiche borne (« Demander à Volta ») : posée une seule fois.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const q = params.get('question')
    if (!q || etat?.disponible !== true) return
    setParams({}, { replace: true })
    void poser(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, etat?.disponible])
  const derniere = [...messages].reverse().find((m) => m.role === 'assistant')

  return (
    <div className="volta-web">
      <header className="volta-entete">
        <span className="volta-avatar"><IconeVolta /></span>
        <div>
          <strong>Volta, votre assistant</strong>
          <span className={indisponible ? undefined : 'en-ligne'}>
            {indisponible ? 'Indisponible' : etat?.questionsRestantes == null ? 'En ligne · questions illimitées' : `En ligne · ${etat.questionsRestantes} question(s) gratuite(s) aujourd’hui`}
          </span>
        </div>
        <Button type="text" shape="circle" size="large" style={{ marginLeft: 'auto' }} icon={<PlusCircleOutlined style={{ color: '#E5545F', fontSize: 24 }} />}
          aria-label="Nouvelle conversation" onClick={() => { setMessages([]); setConversation(null) }} />
      </header>

      <div className="volta-fil">
        {messages.length === 0 && (
          <div className="volta-accueil">
            <h2>Bonjour {user?.prenom} 👋</h2>
            <p>Je suis Volta. Bornes, tarifs, recharges, compte : comment puis-je vous aider ?</p>
            <div className="volta-robot">
              <Lottie animationData={robot} loop autoplay={!mouvementReduit()} />
            </div>
            {indisponible && <Alert type="info" showIcon style={{ textAlign: 'left' }} message="Volta sera disponible dès que Volteo aura activé l’assistant IA." />}
            <div className="volta-suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button key={s.texte} type="button" disabled={indisponible} onClick={() => poser(s.texte)} style={{ animationDelay: `${200 + i * 70}ms` }} dir="auto">
                  <span className="volta-suggestion-icone">{s.icone}</span>{s.texte}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`volta-bulle ${m.role}`}>
            {m.role === 'assistant' ? <TexteRiche texte={m.contenu} /> : <p dir="auto">{m.contenu}</p>}
            {!!m.cartes?.length && <div className="volta-cartes">{m.cartes.slice(0, 6).map((c, j) => <Carte key={j} carte={c} />)}</div>}
          </div>
        ))}
        {envoi && <div className="volta-bulle assistant volta-frappe"><span /><span /><span /></div>}
        {erreur && <Alert type="error" showIcon message={erreur} />}
        {!envoi && derniere?.suggestions?.length ? <Space wrap>{derniere.suggestions.map((s) => <Button key={s} size="small" onClick={() => poser(s)}>{s}</Button>)}</Space> : null}
        <div ref={bas} />
      </div>

      <form className="volta-saisie" onSubmit={(e) => { e.preventDefault(); void poser(question) }}>
        <Input.TextArea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); void poser(question) } }}
          autoSize={{ minRows: 1, maxRows: 4 }}
          maxLength={1000}
          placeholder={indisponible ? 'Assistant indisponible pour le moment' : 'Écrivez votre question…'}
          disabled={indisponible}
        />
        <Button type="primary" shape="circle" htmlType="submit" size="large" icon={<SendOutlined />} loading={envoi} disabled={!question.trim()} />
      </form>
    </div>
  )
}
