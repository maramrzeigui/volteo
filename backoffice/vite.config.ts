import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// API_URL permet de viser une autre instance de l'API (par défaut http://localhost:8000).
const API = process.env.API_URL ?? 'http://localhost:8000'
// LIVE_URL : relais temps réel du serveur OCPP (par défaut le port 9222 du serveur principal).
const LIVE = process.env.LIVE_URL ?? 'ws://localhost:9222'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/storage': { target: API, changeOrigin: true },
      // Relais temps réel (WebSocket) du serveur OCPP.
      '/live': { target: LIVE, ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Bibliothèques lourdes dans des fichiers séparés (mise en cache navigateur).
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/](antd|@ant-design|rc-[^\\/]+)[\\/]/.test(id)) return 'antd'
          if (/[\\/](echarts|zrender|echarts-for-react)[\\/]/.test(id)) return 'echarts'
          if (/[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/.test(id)) return 'carte'
          return undefined
        },
      },
    },
  },
})
