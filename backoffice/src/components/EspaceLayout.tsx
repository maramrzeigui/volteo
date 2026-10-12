import { lazy, Suspense, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Dropdown, Spin } from 'antd'
import {
  AimOutlined,
  AppstoreOutlined,
  CloseOutlined,
  CarOutlined,
  CreditCardOutlined,
  CrownOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  IdcardOutlined,
  LogoutOutlined,
  ThunderboltFilled,
  ThunderboltOutlined,
  UnorderedListOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { espace } from '../api'
import { useAuth } from '../auth'
import { usePlateforme } from '../hooks/usePlateforme'
import { useTempsReel } from '../hooks/useTempsReel'
import { formatMontant } from '../format'
import Marque from './Marque'
import { TransitionPage } from '../motion'
import IconeVolta from './IconeVolta'
import { useSoldeEnDirect } from '../hooks/useSoldeEnDirect'

/** Onglets principaux : les mêmes que la barre du bas de l'application. */
const VoltaChat = lazy(() => import('../pages/espace/Volta'))

const ONGLETS = [
  { to: '/espace', icon: <HomeOutlined />, label: 'Accueil', fin: true },
  { to: '/espace/carte', icon: <EnvironmentOutlined />, label: 'Carte' },
  { to: '/espace/bornes', icon: <ThunderboltOutlined />, label: 'Bornes' },
  { to: '/espace/trajet', icon: <AimOutlined />, label: 'Trajet', bureau: true },
  { to: '/espace/recharges', icon: <UnorderedListOutlined />, label: 'Activité' },
]
const COMPTE = [
  { key: '/espace/profil', icon: <UserOutlined />, label: 'Mon profil' },
  { key: '/espace/paiements', icon: <CreditCardOutlined />, label: 'Wallet et paiements' },
  { key: '/espace/vehicules', icon: <CarOutlined />, label: 'Mes véhicules' },
  { key: '/espace/badges', icon: <IdcardOutlined />, label: 'Badges RFID' },
  { key: '/espace/simulateur', icon: <IdcardOutlined />, label: 'Recharger avec mon badge' },
  { key: '/espace/abonnement', icon: <CrownOutlined />, label: 'Abonnement' },
]

/** Espace client web : même navigation que l'application (onglets, wallet, compte). */
export default function EspaceLayout() {
  const { user, deconnecter } = useAuth()
  const { solde, enCours } = useSoldeEnDirect()
  const plateforme = usePlateforme()
  const navigate = useNavigate()
  const location = useLocation()
  useTempsReel(true, false)
  const { data: active } = useQuery({ queryKey: ['espace', 'active'], queryFn: espace.sessionActive, refetchInterval: 15_000 })

  const initiales = (user?.prenom?.[0] ?? '') + (user?.nom?.[0] ?? '')
  const menuCompte = {
    items: [
      ...COMPTE.map((c) => ({ ...c, onClick: () => navigate(c.key) })),
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Se déconnecter', danger: true, onClick: () => void deconnecter() },
    ],
    selectedKeys: [location.pathname],
  }
  const immersif = location.pathname === '/espace/recharge'
  const [volta, setVolta] = useState(false)
  const pageVolta = location.pathname === '/espace/volta'
  // Trajet : carte plein écran, comme l'écran de l'application (sans barre d'onglets ni Volta).
  const pleinEcran = location.pathname === '/espace/trajet'
  // Fiche d'une borne : écran « poussé » comme dans l'application (sans onglets ni Volta flottant).
  const fiche = /^\/espace\/bornes\/\d+/.test(location.pathname)

  return (
    <div className={`espace-app${immersif ? ' immersif' : ''}${pleinEcran ? ' plein-ecran' : ''}${fiche ? ' ecran-fiche' : ''}`}>
      <header className="espace-barre">
        <Link to="/espace" className="espace-marque" aria-label={`${plateforme.nom} — accueil`}>
          <Marque clair />
        </Link>

        <nav className="espace-onglets" aria-label="Navigation principale">
          {ONGLETS.map((o) => (
            <NavLink key={o.to} to={o.to} end={o.fin} className={({ isActive }) => `espace-onglet${isActive ? ' actif' : ''}`}>
              {o.icon}
              <span>{o.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="espace-actions">
          {active && (
            <Link to="/espace/recharge" className="espace-en-charge">
              <ThunderboltFilled />
              <span>{active.pourcentageBatterie != null ? `${active.pourcentageBatterie} %` : 'En charge'}</span>
            </Link>
          )}
          <Link to="/espace/paiements" className="espace-wallet">
            <WalletOutlined />
            <span>{formatMontant(solde)}</span>
            {enCours > 0 && <small className="espace-wallet-encours">−{formatMontant(enCours)}</small>}
          </Link>
          <Dropdown menu={menuCompte} trigger={['click']} placement="bottomRight">
            <button type="button" className="espace-compte" aria-label="Mon compte">
              <Avatar size={38} src={user?.photoUrl ?? undefined}>{initiales}</Avatar>
              <span className="espace-compte-nom">
                <strong>{user?.prenom}</strong>
                <span>Espace client</span>
              </span>
            </button>
          </Dropdown>
        </div>
      </header>

      <main className="espace-contenu">
        <Suspense fallback={<div className="chargement-page"><Spin size="large" /></div>}>
          <TransitionPage cle={location.pathname}>
            <Outlet />
          </TransitionPage>
        </Suspense>
      </main>

      {/* Volta : bouton flottant comme dans l'application, la discussion s'ouvre en panneau. */}
      {!pageVolta && !immersif && !pleinEcran && !fiche && (
        <>
          {volta && (
            <div className="volta-panneau" role="dialog" aria-label="Volta, votre assistant">
              <button type="button" className="volta-panneau-fermer" aria-label="Fermer Volta" onClick={() => setVolta(false)}><CloseOutlined /></button>
              <Suspense fallback={<div className="chargement-page"><Spin /></div>}>
                <VoltaChat />
              </Suspense>
            </div>
          )}
          <button type="button" className={`volta-flottant${volta ? ' ouvert' : ''}`} aria-label={volta ? 'Fermer Volta' : 'Ouvrir Volta, votre assistant'} onClick={() => setVolta((v) => !v)}>
            {volta ? <CloseOutlined /> : <IconeVolta />}
            {!volta && <span className="volta-flottant-etincelle">✦</span>}
          </button>
        </>
      )}

      {/* Petits écrans : barre d'onglets en bas, comme sur le téléphone */}
      <nav className="espace-tabbar" aria-label="Onglets">
        {ONGLETS.filter((o) => !o.bureau).map((o) => (
          <NavLink key={o.to} to={o.to} end={o.fin} className={({ isActive }) => `espace-tab${isActive ? ' actif' : ''}`}>
            {o.icon}
            <span>{o.label}</span>
          </NavLink>
        ))}
        <Dropdown menu={{ ...menuCompte, items: [...menuCompte.items] }} trigger={['click']} placement="topRight">
          <button type="button" className={`espace-tab${COMPTE.some((c) => c.key === location.pathname) ? ' actif' : ''}`}>
            <AppstoreOutlined />
            <span>Compte</span>
          </button>
        </Dropdown>
      </nav>
    </div>
  )
}
