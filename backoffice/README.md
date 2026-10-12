# Plateforme web BorneApp

Application React (TypeScript, Ant Design, React Query, Axios, ECharts, Leaflet) qui sert à la fois :

- le **back-office** du personnel (super administrateur, exploitant, opérateur, technicien,
  service client, finance) — menus et actions filtrés par la matrice des droits ;
- l'**espace client** web (bornes, recharge en direct, paiements, factures, véhicules, badges, abonnement).

```bash
npm install
npm run dev      # http://localhost:5173 (proxy /api et /storage → :8000, /live → :9222)
npm run build    # typecheck + build de production dans dist/
```

## Organisation

```
src/
  api.ts            appels REST (axios + jeton Sanctum), téléchargements protégés
  auth.tsx          session, permissions du rôle (peut(module, niveau))
  types.ts          types alignés sur l'API Laravel
  format.ts         libellés, couleurs, formats (devise et fuseau de la plateforme)
  hooks/            temps réel WebSocket, paramètres publics de la plateforme
  components/       layouts, carte Leaflet, sessions, documents, formulaire borne…
  pages/            un fichier par interface du cahier des charges
  pages/espace/     espace client
```

Les mises à jour temps réel arrivent par le WebSocket `/live` (relais du serveur OCPP) et rafraîchissent
les données concernées ; sans lui, les écrans se rafraîchissent périodiquement.
