import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Badge, Button, Dropdown, Grid, Layout, Menu, Space, Spin, Tag, Tooltip } from 'antd'
import {
  AlertOutlined,
  AuditOutlined,
  BarChartOutlined,
  BellOutlined,
  CarOutlined,
  CreditCardOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  IdcardOutlined,
  LogoutOutlined,
  MenuOutlined,
  MonitorOutlined,
  SettingOutlined,
  TagsOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UnorderedListOutlined,
  UserOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { fetchStats } from '../api'
import { useTempsReel } from '../hooks/useTempsReel'
import { usePlateforme } from '../hooks/usePlateforme'
import { ROLE_COLORS, ROLE_LABELS } from '../format'
import type { User, Module } from '../types'
import Marque from './Marque'
import { EASE, mouvementReduit, TransitionPage } from '../motion'

const { Sider, Header, Content } = Layout

interface EntreeMenu {
  chemin: string
  module: Module
  label: string
  icone: ReactNode
  groupe: string
  /** Entrée réservée : « plateforme » (super-admin) ou « station » (personnel d'une station). */
  reserve?: 'plateforme' | 'station'
}

/** Une entrée est visible si le module est autorisé et la réserve respectée. */
export function entreeVisible(m: EntreeMenu, user: User | null, peut: (m: Module) => boolean) {
  if (m.reserve === 'plateforme') return user?.role === 'super_admin'
  if (m.reserve === 'station') return !!user?.station
  return peut(m.module)
}

export const MENU_PERSONNEL: EntreeMenu[] = [
  { chemin: '/ma-station', module: 'dashboard', label: 'Ma station', icone: <ShopOutlined />, groupe: 'Pilotage', reserve: 'station' },
  { chemin: '/stations', module: 'dashboard', label: 'Stations clientes', icone: <ShopOutlined />, groupe: 'Plateforme', reserve: 'plateforme' },
  { chemin: '/tableau-de-bord', module: 'dashboard', label: 'Tableau de bord', icone: <DashboardOutlined />, groupe: 'Pilotage' },
  { chemin: '/supervision', module: 'supervision', label: 'Supervision', icone: <MonitorOutlined />, groupe: 'Pilotage' },
  { chemin: '/carte', module: 'supervision', label: 'Carte GIS', icone: <EnvironmentOutlined />, groupe: 'Pilotage' },
  { chemin: '/alertes', module: 'alertes', label: 'Alertes', icone: <AlertOutlined />, groupe: 'Pilotage' },
  { chemin: '/bornes', module: 'bornes', label: 'Bornes', icone: <ThunderboltOutlined />, groupe: 'Réseau' },
  { chemin: '/sessions', module: 'sessions', label: 'Sessions', icone: <UnorderedListOutlined />, groupe: 'Réseau' },
  { chemin: '/maintenance', module: 'maintenance', label: 'Maintenance', icone: <ToolOutlined />, groupe: 'Réseau' },
  { chemin: '/firmware', module: 'firmware', label: 'Firmware', icone: <CloudUploadOutlined />, groupe: 'Réseau' },
  { chemin: '/documents', module: 'documents', label: 'Documents', icone: <FileTextOutlined />, groupe: 'Réseau' },
  { chemin: '/utilisateurs', module: 'utilisateurs', label: 'Utilisateurs', icone: <TeamOutlined />, groupe: 'Clients' },
  { chemin: '/badges', module: 'rfid', label: 'Badges RFID', icone: <IdcardOutlined />, groupe: 'Clients' },
  { chemin: '/vehicules', module: 'vehicules', label: 'Véhicules', icone: <CarOutlined />, groupe: 'Clients' },
  { chemin: '/facturation', module: 'paiements', label: 'Facturation', icone: <CreditCardOutlined />, groupe: 'Finance' },
  { chemin: '/tarification', module: 'tarification', label: 'Tarification', icone: <TagsOutlined />, groupe: 'Finance' },
  { chemin: '/rapports', module: 'rapports', label: 'Rapports', icone: <BarChartOutlined />, groupe: 'Finance' },
  { chemin: '/parametres', module: 'parametres', label: 'Paramètres', icone: <SettingOutlined />, groupe: 'Administration' },
  { chemin: '/audit', module: 'audit', label: "Journal d'audit", icone: <AuditOutlined />, groupe: 'Administration' },
]

const ETAT_TEMPS_REEL = {
  connecte: { libelle: 'En direct', texte: 'Temps réel connecté' },
  reconnexion: { libelle: 'Reconnexion…', texte: 'Reconnexion au temps réel…' },
  hors_ligne: { libelle: 'Différé', texte: 'Temps réel indisponible (rafraîchissement périodique)' },
} as const

export default function AppLayout() {
  const { user, peut, deconnecter } = useAuth()
  const plateforme = usePlateforme()
  const navigate = useNavigate()
  const location = useLocation()
  const ecrans = Grid.useBreakpoint()
  const mobile = !ecrans.lg
  // Bureau : menu replié en icônes à la demande. Mobile : menu masqué, ouvert par le bouton.
  const [replie, setReplie] = useState(false)
  const [ouvertMobile, setOuvertMobile] = useState(false)
  const collapsed = mobile ? !ouvertMobile : replie

  const tempsReel = useTempsReel(true, peut('alertes'))

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    enabled: peut('dashboard'),
    refetchInterval: 60_000,
  })

  const alertesOuvertes = stats?.alertesOuvertes ?? 0

  // Ouverture : la navigation se déroule en cascade.
  const navigation = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (mouvementReduit()) return
      gsap.from('.marque, .ant-menu-item-group-title, .ant-menu-item', {
        x: -14,
        autoAlpha: 0,
        duration: 0.5,
        ease: EASE,
        stagger: 0.022,
        delay: 0.05,
        clearProps: 'transform,opacity,visibility',
      })
    },
    { scope: navigation },
  )

  // Nouvelle alerte : la cloche oscille.
  const cloche = useRef<HTMLSpanElement>(null)
  const alertesPrecedentes = useRef<number | null>(null)
  useEffect(() => {
    const avant = alertesPrecedentes.current
    alertesPrecedentes.current = alertesOuvertes
    if (avant === null || alertesOuvertes <= avant || !cloche.current || mouvementReduit()) return
    const tween = gsap.fromTo(
      cloche.current,
      { rotation: -18, transformOrigin: '50% 10%' },
      { rotation: 0, duration: 1.2, ease: 'elastic.out(1.1, 0.25)' },
    )
    return () => {
      tween.kill()
    }
  }, [alertesOuvertes])
  const items = useMemo(() => {
    const groupes = new Map<string, EntreeMenu[]>()
    MENU_PERSONNEL.filter((m) => entreeVisible(m, user, peut)).forEach((m) => {
      groupes.set(m.groupe, [...(groupes.get(m.groupe) ?? []), m])
    })
    return [...groupes.entries()].map(([groupe, entrees]) => ({
      type: 'group' as const,
      key: groupe,
      label: groupe,
      children: entrees.map((m) => ({
        key: m.chemin,
        icon: m.icone,
        label:
          m.module === 'alertes' && alertesOuvertes ? (
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {m.label}
              <Badge count={alertesOuvertes} size="small" />
            </span>
          ) : (
            m.label
          ),
      })),
    }))
  }, [peut, alertesOuvertes, user])

  const entree = MENU_PERSONNEL.find((m) => location.pathname.startsWith(m.chemin))
  const selection = entree?.chemin ?? ''
  const etatTr = ETAT_TEMPS_REEL[tempsReel]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        ref={navigation}
        className="navigation"
        width={248}
        collapsedWidth={mobile ? 0 : 76}
        collapsed={collapsed}
        trigger={null}
        style={
          mobile
            ? { position: 'fixed', insetInlineStart: 0, top: 0, height: '100vh', overflow: 'auto', zIndex: 30 }
            : { position: 'sticky', top: 0, height: '100vh', overflow: 'auto', zIndex: 20 }
        }
      >
        <Link to="/" className="marque" aria-label={`${plateforme.nom} — accueil`}>
          <Marque replie={collapsed} />
        </Link>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selection]}
          items={items}
          onClick={({ key }) => {
            navigate(key)
            if (mobile) setOuvertMobile(false)
          }}
        />
        {!collapsed && stats && (
          <div className="navigation-pied">
            <strong>
              {stats.bornesActives}/{stats.bornesTotal} bornes en service
            </strong>
            {stats.sessionsEnCours} recharge(s) en cours
          </div>
        )}
      </Sider>
      {mobile && ouvertMobile && <div className="voile" onClick={() => setOuvertMobile(false)} />}
      <Layout>
        <Header className="entete">
          <Space>
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => (mobile ? setOuvertMobile((o) => !o) : setReplie((r) => !r))}
              aria-label="Menu"
            />
            {!mobile && (
              <span className="entete-titre">
                {entree ? (
                  <>
                    {entree.groupe} <span aria-hidden>/</span> <b>{entree.label}</b>
                  </>
                ) : (
                  'Plateforme de gestion des bornes de recharge'
                )}
              </span>
            )}
          </Space>
          <Space size={mobile ? 8 : 16}>
            <Tooltip title={etatTr.texte}>
              <span className={`direct direct-${tempsReel}`} role="status">
                <span className="direct-point" />
                {!mobile && etatTr.libelle}
              </span>
            </Tooltip>
            {peut('alertes') && (
              <Tooltip title="Alertes ouvertes">
                <span>
                  <Badge count={alertesOuvertes} size="small">
                    <Button
                      type="text"
                      icon={<span ref={cloche} style={{ display: 'inline-flex' }}><BellOutlined /></span>}
                      onClick={() => navigate('/alertes')}
                      aria-label="Alertes"
                    />
                  </Badge>
                </span>
              </Tooltip>
            )}
            <Dropdown
              menu={{
                items: [
                  ...(user ? [{ key: 'role', disabled: true, label: <Tag color={ROLE_COLORS[user.role]} style={{ margin: 0 }}>{ROLE_LABELS[user.role]}</Tag> }] : []),
                  { key: 'profil', icon: <UserOutlined />, label: 'Mon profil', onClick: () => navigate('/profil') },
                  { type: 'divider' },
                  { key: 'logout', icon: <LogoutOutlined />, label: 'Se déconnecter', danger: true, onClick: () => void deconnecter() },
                ],
              }}
            >
              <span className="avatar-utilisateur">
                <Avatar size={32}>{(user?.prenom?.[0] ?? '') + (user?.nom?.[0] ?? '')}</Avatar>
                {!mobile && (
                  <span className="avatar-nom">
                    <strong>
                      {user?.prenom} {user?.nom}
                    </strong>
                    <span>{user ? (user.station ? `${ROLE_LABELS[user.role]} · ${user.station.nom}` : user.role === 'super_admin' ? 'Super-admin · plateforme' : ROLE_LABELS[user.role]) : ''}</span>
                  </span>
                )}
              </span>
            </Dropdown>
          </Space>
        </Header>
        <Content className="contenu">
          <Suspense fallback={<div className="chargement-page"><Spin size="large" /></div>}>
            <TransitionPage cle={location.pathname}>
              <Outlet />
            </TransitionPage>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  )
}
