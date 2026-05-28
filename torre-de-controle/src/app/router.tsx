import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { AuthGuard } from './AuthGuard'
import { LoginPage } from './pages/login/LoginPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { TorreDeControlePage } from './pages/torre-de-controle/TorreDeControlePage'
import { ViagensPage } from './pages/viagens/ViagensPage'
import { MotoristasPage } from './pages/motoristas/MotoristasPage'
import { GeofencesPage } from './pages/geofences/GeofencesPage'
import { AlertasPage } from './pages/alertas/AlertasPage'
import { InsightsPage } from './pages/insights/InsightsPage'
import { ConfiguracoesPage } from './pages/configuracoes/ConfiguracoesPage'

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
          { path: 'torre-de-controle', element: <TorreDeControlePage /> },
          { path: 'viagens',           element: <ViagensPage /> },
          { path: 'motoristas',        element: <MotoristasPage /> },
          { path: 'geofences',         element: <GeofencesPage /> },
          { path: 'alertas',           element: <AlertasPage /> },
          { path: 'insights',          element: <InsightsPage /> },
          { path: 'configuracoes',     element: <ConfiguracoesPage /> },
        ],
      },
    ],
  },
])
