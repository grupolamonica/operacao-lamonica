import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { AuthGuard } from './AuthGuard'
import { LoginPage } from './pages/login/LoginPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'

// Lazy-loaded route chunks (D-26 — code-splitting)
// Dashboard + Login + AuthGuard remain eager (entry/critical path).
const TorreDeControlePage = lazy(() =>
  import('./pages/torre-de-controle/TorreDeControlePage').then(m => ({ default: m.TorreDeControlePage })),
)
const ViagensPage = lazy(() =>
  import('./pages/viagens/ViagensPage').then(m => ({ default: m.ViagensPage })),
)
const MotoristasPage = lazy(() =>
  import('./pages/motoristas/MotoristasPage').then(m => ({ default: m.MotoristasPage })),
)
const GeofencesPage = lazy(() =>
  import('./pages/geofences/GeofencesPage').then(m => ({ default: m.GeofencesPage })),
)
const AlertasPage = lazy(() =>
  import('./pages/alertas/AlertasPage').then(m => ({ default: m.AlertasPage })),
)
const InsightsPage = lazy(() =>
  import('./pages/insights/InsightsPage').then(m => ({ default: m.InsightsPage })),
)
const RankingPage = lazy(() =>
  import('./pages/ranking/RankingPage').then(m => ({ default: m.RankingPage })),
)
const HeatmapPage = lazy(() =>
  import('./pages/heatmap/HeatmapPage').then(m => ({ default: m.HeatmapPage })),
)
const BiExecutivoPage = lazy(() =>
  import('./pages/bi-executivo/BiExecutivoPage').then(m => ({ default: m.BiExecutivoPage })),
)
const PrevisaoPage = lazy(() =>
  import('./pages/previsao/PrevisaoPage').then(m => ({ default: m.PrevisaoPage })),
)
const AssistentePage = lazy(() =>
  import('./pages/assistente/AssistentePage').then(m => ({ default: m.AssistentePage })),
)
const SimuladorPage = lazy(() =>
  import('./pages/simulador/SimuladorPage').then(m => ({ default: m.SimuladorPage })),
)
const ConfiguracoesPage = lazy(() =>
  import('./pages/configuracoes/ConfiguracoesPage').then(m => ({ default: m.ConfiguracoesPage })),
)

/**
 * Suspense wrapper for lazy route chunks.
 * Displays a lightweight fallback while the chunk loads.
 */
function L({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Carregando...</div>}>
      {children}
    </Suspense>
  )
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AuthGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard',         element: <DashboardPage /> },
          { path: 'torre-de-controle', element: <L><TorreDeControlePage /></L> },
          { path: 'viagens',           element: <L><ViagensPage /></L> },
          { path: 'motoristas',        element: <L><MotoristasPage /></L> },
          { path: 'geofences',         element: <L><GeofencesPage /></L> },
          { path: 'alertas',           element: <L><AlertasPage /></L> },
          { path: 'insights',          element: <L><InsightsPage /></L> },
          { path: 'bi-executivo',      element: <L><BiExecutivoPage /></L> },
          { path: 'previsao',          element: <L><PrevisaoPage /></L> },
          { path: 'assistente',        element: <L><AssistentePage /></L> },
          { path: 'simulador',         element: <L><SimuladorPage /></L> },
          { path: 'heatmap',           element: <L><HeatmapPage /></L> },
          { path: 'ranking',           element: <L><RankingPage /></L> },
          { path: 'configuracoes',     element: <L><ConfiguracoesPage /></L> },
        ],
      },
    ],
  },
])
