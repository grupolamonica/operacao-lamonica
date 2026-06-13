import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { router } from './app/router'
import { initSentry } from './lib/sentry'

// Phase 6 / 06-CONTEXT D-38: Sentry must be initialized BEFORE React mounts
// so error boundaries and unhandled-rejection capture are wired from boot.
initSentry()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,     // 30s — matches API Redis cache
      // Operador "sempre atualizado" sem clicar em nada, gastando o mínimo:
      // - volta à aba → atualiza na hora (refetch grátis, só quando ele olha);
      // - aba oculta → o poll (refetchInterval dos hooks) PAUSA (consumo zero em background);
      // - reconectou a internet → revalida.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchIntervalInBackground: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
