import { StrictMode, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import frFR from 'antd/es/locale/fr_FR'
import enUS from 'antd/es/locale/en_US'
import arEG from 'antd/es/locale/ar_EG'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'
import 'dayjs/locale/ar'
import relativeTime from 'dayjs/plugin/relativeTime'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'antd/dist/reset.css'
import '@fontsource-variable/outfit'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/jetbrains-mono'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App'
import { AuthProvider } from './auth'
import { usePlateforme } from './hooks/usePlateforme'
import { configurerFormat } from './format'
import { themeAntd } from './theme'
import { activerHaloCartes } from './motion'

dayjs.extend(relativeTime)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isoWeek)
dayjs.locale('fr')
activerHaloCartes()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
})

const LOCALES = { fr: frFR, en: enUS, ar: arEG }

/** Langue, devise et fuseau horaire viennent du paramétrage de la plateforme (module 17). */
function Theme({ children }: { children: ReactNode }) {
  const plateforme = usePlateforme()

  configurerFormat({ devise: plateforme.devise, fuseauHoraire: plateforme.fuseauHoraire })
  useEffect(() => {
    dayjs.locale(plateforme.langue === 'en' ? 'en' : plateforme.langue)
    document.title = `${plateforme.nom} — Plateforme de recharge`
    document.documentElement.lang = plateforme.langue
  }, [plateforme])

  return (
    <ConfigProvider
      locale={LOCALES[plateforme.langue] ?? frFR}
      direction={plateforme.langue === 'ar' ? 'rtl' : 'ltr'}
      theme={themeAntd}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Theme>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </Theme>
    </QueryClientProvider>
  </StrictMode>,
)
