import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react'

/**
 * Pages chargées à la demande. Elles sont toutes préchargées en arrière-plan juste après
 * l'ouverture : changer de page est ensuite instantané (plus d'écran vide pendant le chargement).
 */
const importeurs: (() => Promise<unknown>)[] = []
function page<T extends ComponentType<any>>(importer: () => Promise<{ default: T }>) {
  importeurs.push(importer)
  return lazy(importer)
}
function usePrechargement() {
  useEffect(() => {
    const lancer = () => importeurs.forEach((i) => void i().catch(() => undefined))
    const ric = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback
    if (ric) ric(lancer)
    else setTimeout(lancer, 1500)
  }, [])
}
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Result, Spin, Button } from 'antd'
import { useAuth } from './auth'
import type { Module } from './types'
import AppLayout, { entreeVisible, MENU_PERSONNEL } from './components/AppLayout'
import EspaceLayout from './components/EspaceLayout'
import LoginPage from './pages/Login'

const DashboardPage = page(() => import('./pages/Dashboard'))
const SupervisionPage = page(() => import('./pages/Supervision'))
const CartePage = page(() => import('./pages/Carte'))
const BornesPage = page(() => import('./pages/Bornes'))
const BorneDetailPage = page(() => import('./pages/BorneDetail'))
const SessionsPage = page(() => import('./pages/Sessions'))
const UtilisateursPage = page(() => import('./pages/Utilisateurs'))
const UtilisateurDetailPage = page(() => import('./pages/UtilisateurDetail'))
const BadgesPage = page(() => import('./pages/Badges'))
const VehiculesPage = page(() => import('./pages/Vehicules'))
const FacturationPage = page(() => import('./pages/Facturation'))
const TarificationPage = page(() => import('./pages/Tarification'))
const MaintenancePage = page(() => import('./pages/Maintenance'))
const AlertesPage = page(() => import('./pages/Alertes'))
const FirmwarePage = page(() => import('./pages/Firmware'))
const RapportsPage = page(() => import('./pages/Rapports'))
const DocumentsPage = page(() => import('./pages/Documents'))
const ParametresPage = page(() => import('./pages/Parametres'))
const AuditPage = page(() => import('./pages/Audit'))
const ProfilPage = page(() => import('./pages/Profil'))
const StationsPage = page(() => import('./pages/Stations'))
const MaStationPage = page(() => import('./pages/MaStation'))

const EspaceAccueil = page(() => import('./pages/espace/Accueil'))
const EspaceCarte = page(() => import('./pages/espace/CarteClient'))
const EspaceRecharges = page(() => import('./pages/espace/Recharges'))
const EspacePaiements = page(() => import('./pages/espace/Paiements'))
const EspaceVehicules = page(() => import('./pages/espace/VehiculesClient'))
const EspaceBadges = page(() => import('./pages/espace/BadgesClient'))
const EspaceAbonnement = page(() => import('./pages/espace/Abonnement'))
const EspaceTrajet = page(() => import('./pages/espace/Trajet'))
const EspaceVolta = page(() => import('./pages/espace/Volta'))
const EspaceRecharge = page(() => import('./pages/espace/Recharge'))
const EspaceBornes = page(() => import('./pages/espace/Bornes'))
const EspaceSimulateur = page(() => import('./pages/espace/Simulateur'))
const OuvrirBorne = page(() => import('./pages/espace/OuvrirBorne'))
const EspaceBorneFiche = page(() => import('./pages/espace/BorneFiche'))

function Chargement() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 80 }}>
      <Spin size="large" />
    </div>
  )
}

/** Garde de route : le module doit être accessible au rôle (matrice §7). */
function Garde({ module, children }: { module: Module; children: ReactNode }) {
  const { peut } = useAuth()
  if (!peut(module)) {
    return (
      <Result
        status="403"
        title="Accès refusé"
        subTitle="Votre rôle ne donne pas accès à ce module."
        extra={<Button href="/">Retour à l'accueil</Button>}
      />
    )
  }
  return <>{children}</>
}

/** Première page autorisée pour le personnel. */
function Accueil() {
  const { user, peut } = useAuth()
  if (!user) return <Navigate to="/connexion" replace />
  if (user.role === 'client') return <Navigate to="/espace" replace />
  // Station : son tableau de bord ; super-admin : la console des stations.
  const premiere = MENU_PERSONNEL.find((m) => entreeVisible(m, user, peut))
  return <Navigate to={premiere?.chemin ?? '/profil'} replace />
}

function Protege({ children, client }: { children: ReactNode; client?: boolean }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/connexion" state={{ depuis: location.pathname }} replace />
  if (client && user.role !== 'client') return <Navigate to="/" replace />
  if (!client && user.role === 'client') return <Navigate to="/espace" replace />
  return <>{children}</>
}

export default function App() {
  const { user } = useAuth()
  usePrechargement()

  return (
    <Suspense fallback={<Chargement />}>
      <Routes>
        <Route path="/connexion" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        {/* Lien du QR code collé sur une borne */}
        <Route path="/b/:reference" element={<Protege client><OuvrirBorne /></Protege>} />
        <Route path="/inscription" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/" element={<Accueil />} />

        <Route
          element={
            <Protege>
              <AppLayout />
            </Protege>
          }
        >
          <Route path="/tableau-de-bord" element={<Garde module="dashboard"><DashboardPage /></Garde>} />
          <Route path="/supervision" element={<Garde module="supervision"><SupervisionPage /></Garde>} />
          <Route path="/carte" element={<Garde module="supervision"><CartePage /></Garde>} />
          <Route path="/bornes" element={<Garde module="bornes"><BornesPage /></Garde>} />
          <Route path="/bornes/:id" element={<Garde module="bornes"><BorneDetailPage /></Garde>} />
          <Route path="/sessions" element={<Garde module="sessions"><SessionsPage /></Garde>} />
          <Route path="/utilisateurs" element={<Garde module="utilisateurs"><UtilisateursPage /></Garde>} />
          <Route path="/utilisateurs/:id" element={<Garde module="utilisateurs"><UtilisateurDetailPage /></Garde>} />
          <Route path="/badges" element={<Garde module="rfid"><BadgesPage /></Garde>} />
          <Route path="/vehicules" element={<Garde module="vehicules"><VehiculesPage /></Garde>} />
          <Route path="/facturation" element={<Garde module="paiements"><FacturationPage /></Garde>} />
          <Route path="/tarification" element={<Garde module="tarification"><TarificationPage /></Garde>} />
          <Route path="/maintenance" element={<Garde module="maintenance"><MaintenancePage /></Garde>} />
          <Route path="/alertes" element={<Garde module="alertes"><AlertesPage /></Garde>} />
          <Route path="/firmware" element={<Garde module="firmware"><FirmwarePage /></Garde>} />
          <Route path="/rapports" element={<Garde module="rapports"><RapportsPage /></Garde>} />
          <Route path="/documents" element={<Garde module="documents"><DocumentsPage /></Garde>} />
          <Route path="/parametres" element={<Garde module="parametres"><ParametresPage /></Garde>} />
          <Route path="/audit" element={<Garde module="audit"><AuditPage /></Garde>} />
          <Route path="/stations" element={user?.role === 'super_admin' ? <StationsPage /> : <Navigate to="/" replace />} />
          <Route path="/ma-station" element={user?.station ? <MaStationPage /> : <Navigate to="/" replace />} />
          <Route path="/profil" element={<ProfilPage />} />
        </Route>

        <Route
          path="/espace"
          element={
            <Protege client>
              <EspaceLayout />
            </Protege>
          }
        >
          <Route index element={<EspaceAccueil />} />
          <Route path="trajet" element={<EspaceTrajet />} />
          <Route path="volta" element={<EspaceVolta />} />
          <Route path="recharge" element={<EspaceRecharge />} />
          <Route path="bornes" element={<EspaceBornes />} />
          <Route path="simulateur" element={<EspaceSimulateur />} />
          <Route path="bornes/:id" element={<EspaceBorneFiche />} />
          <Route path="carte" element={<EspaceCarte />} />
          <Route path="recharges" element={<EspaceRecharges />} />
          <Route path="paiements" element={<EspacePaiements />} />
          <Route path="vehicules" element={<EspaceVehicules />} />
          <Route path="badges" element={<EspaceBadges />} />
          <Route path="abonnement" element={<EspaceAbonnement />} />
          <Route path="profil" element={<ProfilPage />} />
        </Route>

        <Route
          path="*"
          element={<Result status="404" title="Page introuvable" extra={<Button href="/">Accueil</Button>} />}
        />
      </Routes>
    </Suspense>
  )
}
