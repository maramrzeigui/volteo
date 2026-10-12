import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { App, Button, Form, Input } from 'antd'
import { connexionGoogle, errorMessage, inscrire, login, motDePasseOublie, reinitialiserMotDePasse, verifier2fa } from '../api'
import { useAuth } from '../auth'
import ArretRecharge from '../components/ArretRecharge'
import BoutonGoogle from '../components/BoutonGoogle'
import Marque from '../components/Marque'
import type { LoginResponse } from '../types'

type Etape = 'connexion' | '2fa' | 'oubli' | 'reinitialisation' | 'inscription'

/** Champ mot de passe avec « Afficher » à droite, comme dans l'application. */
function MotDePasse({ placeholder, autoComplete, ...rest }: { placeholder: string; autoComplete: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <Input
      {...rest}
      type={visible ? 'text' : 'password'}
      placeholder={placeholder}
      autoComplete={autoComplete}
      suffix={<button type="button" className="champ-afficher" onClick={() => setVisible((v) => !v)}>{visible ? 'Masquer' : 'Afficher'}</button>}
    />
  )
}

const TEXTES: Record<Etape, { titre: string; sousTitre: string }> = {
  connexion: { titre: 'Rechargez partout en Tunisie', sousTitre: 'Trouvez une borne, lancez la charge et payez depuis votre téléphone.' },
  inscription: { titre: 'Créer un compte', sousTitre: 'Quelques secondes suffisent pour lancer votre première recharge.' },
  '2fa': { titre: 'Vérification', sousTitre: 'Saisissez le code à 6 chiffres reçu par email.' },
  oubli: { titre: 'Mot de passe oublié', sousTitre: 'Nous vous envoyons un code de réinitialisation par email.' },
  reinitialisation: { titre: 'Nouveau mot de passe', sousTitre: 'Saisissez le code reçu et choisissez un nouveau mot de passe.' },
}

/** Connexion et inscription : même écran que l'application mobile. */
export default function LoginPage() {
  const { connecter } = useAuth()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [etape, setEtape] = useState<Etape>(location.pathname === '/inscription' ? 'inscription' : 'connexion')
  const [email, setEmail] = useState('')
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const aboutir = (r: LoginResponse) => {
    if (r.twoFactor) {
      setEtape('2fa')
      setInfo('Un code à 6 chiffres vient de vous être envoyé par email.')
      return
    }
    if (r.token && r.user) {
      connecter(r.token, r.user)
      message.success(`Bienvenue ${r.user.prenom ?? ''}`)
      const depuis = (location.state as { depuis?: string } | null)?.depuis
      navigate(depuis && depuis !== '/connexion' ? depuis : '/', { replace: true })
    }
  }

  const executer = async (action: () => Promise<void>) => {
    setChargement(true)
    setErreur(null)
    try {
      await action()
    } catch (e) {
      setErreur(errorMessage(e, 'Connexion impossible. Le serveur est-il démarré ?'))
    } finally {
      setChargement(false)
    }
  }

  const changer = (e: Etape) => {
    setEtape(e)
    setErreur(null)
    setInfo(null)
  }

  const google = (jeton: string) => executer(async () => aboutir(await connexionGoogle(jeton)))
  const separateurGoogle: ReactNode = (
    <>
      <div className="connexion-ou"><span>Ou continuer avec</span></div>
      <BoutonGoogle onJeton={google} desactive={chargement} />
    </>
  )

  return (
    <div className="connexion-app">
      <div className="connexion-app-colonne">
        <header className="connexion-app-entete">
          {etape === 'connexion' ? <Marque clair /> : (
            <button type="button" className="connexion-retour" onClick={() => changer('connexion')}>Retour</button>
          )}
          <h1>{TEXTES[etape].titre}</h1>
          <p>{TEXTES[etape].sousTitre}</p>
          {etape === 'connexion' && <div className="connexion-app-scene"><ArretRecharge /></div>}
        </header>

        <section className="connexion-app-panneau">
          {erreur && <div className="connexion-message erreur">{erreur}</div>}
          {info && <div className="connexion-message">{info}</div>}

          {etape === 'connexion' && (
            <Form layout="vertical" requiredMark={false} size="large"
              onFinish={(v: { email: string; password: string }) => executer(async () => {
                setEmail(v.email)
                aboutir(await login(v.email, v.password))
              })}>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Email valide requis' }]}>
                <Input autoComplete="email" placeholder="vous@exemple.tn" autoFocus />
              </Form.Item>
              <Form.Item name="password" label="Mot de passe" rules={[{ required: true, message: 'Mot de passe requis' }]} style={{ marginBottom: 8 }}>
                <MotDePasse placeholder="Votre mot de passe" autoComplete="current-password" />
              </Form.Item>
              <div className="connexion-oubli"><button type="button" onClick={() => changer('oubli')}>Mot de passe oublié ?</button></div>
              <Button type="primary" htmlType="submit" block loading={chargement} className="connexion-bouton">Se connecter</Button>
              {separateurGoogle}
              <p className="connexion-bas">Nouveau sur Volteo ? <button type="button" onClick={() => changer('inscription')}>Créer un compte</button></p>
            </Form>
          )}

          {etape === 'inscription' && (
            <Form layout="vertical" requiredMark={false} size="large"
              onFinish={(v: { prenom: string; nom: string; email: string; telephone?: string; password: string }) =>
                executer(async () => aboutir(await inscrire({ prenom: v.prenom, nom: v.nom, email: v.email, telephone: v.telephone, password: v.password })))}>
              <div className="connexion-deux">
                <Form.Item name="prenom" label="Prénom" rules={[{ required: true, message: 'Prénom requis' }]}><Input placeholder="Maram" autoComplete="given-name" /></Form.Item>
                <Form.Item name="nom" label="Nom" rules={[{ required: true, message: 'Nom requis' }]}><Input placeholder="Rzeigui" autoComplete="family-name" /></Form.Item>
              </div>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Email valide requis' }]}><Input placeholder="vous@exemple.tn" autoComplete="email" /></Form.Item>
              <Form.Item name="telephone" label="Téléphone (facultatif)"><Input placeholder="+216 20 000 000" autoComplete="tel" /></Form.Item>
              <Form.Item name="password" label="Mot de passe" rules={[{ required: true, min: 8, message: '8 caractères minimum' }]}>
                <MotDePasse placeholder="8 caractères minimum" autoComplete="new-password" />
              </Form.Item>
              <Form.Item name="confirmation" label="Confirmer le mot de passe" dependencies={['password']}
                rules={[{ required: true, message: 'Confirmez le mot de passe' }, ({ getFieldValue }) => ({
                  validator: (_, v) => (!v || v === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('Les mots de passe ne correspondent pas'))),
                })]}>
                <MotDePasse placeholder="Retapez le mot de passe" autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={chargement} className="connexion-bouton">Créer mon compte</Button>
              {separateurGoogle}
              <p className="connexion-bas">Déjà inscrit ? <button type="button" onClick={() => changer('connexion')}>Se connecter</button></p>
            </Form>
          )}

          {etape === '2fa' && (
            <Form layout="vertical" requiredMark={false} size="large" onFinish={(v: { code: string }) => executer(async () => aboutir(await verifier2fa(email, v.code)))}>
              <Form.Item name="code" label="Code de vérification" rules={[{ required: true, len: 6, message: 'Code à 6 chiffres' }]}><Input.OTP length={6} autoFocus /></Form.Item>
              <Button type="primary" htmlType="submit" block loading={chargement} className="connexion-bouton">Vérifier le code</Button>
              <Button type="text" block onClick={() => changer('connexion')} style={{ marginTop: 8 }}>Changer de compte</Button>
            </Form>
          )}

          {etape === 'oubli' && (
            <Form layout="vertical" requiredMark={false} size="large"
              onFinish={(v: { email: string }) => executer(async () => {
                setEmail(v.email)
                const r = await motDePasseOublie(v.email)
                setEtape('reinitialisation')
                setInfo(r.message)
              })}>
              <Form.Item name="email" label="Email du compte" rules={[{ required: true, type: 'email', message: 'Email valide requis' }]}><Input placeholder="vous@exemple.tn" autoFocus /></Form.Item>
              <Button type="primary" htmlType="submit" block loading={chargement} className="connexion-bouton">Recevoir un code</Button>
            </Form>
          )}

          {etape === 'reinitialisation' && (
            <Form layout="vertical" requiredMark={false} size="large"
              onFinish={(v: { code: string; password: string }) => executer(async () => {
                const r = await reinitialiserMotDePasse(email, v.code, v.password)
                message.success(r.message)
                changer('connexion')
              })}>
              <Form.Item name="code" label="Code reçu" rules={[{ required: true, len: 6, message: 'Code à 6 chiffres' }]}><Input.OTP length={6} /></Form.Item>
              <Form.Item name="password" label="Nouveau mot de passe" rules={[{ required: true, min: 8, message: '8 caractères minimum' }]}>
                <MotDePasse placeholder="8 caractères minimum" autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={chargement} className="connexion-bouton">Réinitialiser</Button>
            </Form>
          )}
        </section>
        <footer className="connexion-pied"><Link to="/connexion" onClick={() => changer('connexion')}>Volteo</Link> · Recharge de véhicules électriques en Tunisie</footer>
      </div>
    </div>
  )
}
