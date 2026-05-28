import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'

export function AuthGuard() {
  const { user, me } = useAuthStore()
  const [checked, setChecked] = useState(false)
  const [apiDown, setApiDown] = useState(false)

  useEffect(() => {
    me()
      .then(() => setChecked(true))
      .catch(() => { setApiDown(true); setChecked(true) })
  }, [me])

  if (!checked) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground">Carregando…</div>
    </div>
  )

  // API unreachable → show app anyway (offline/dev mode)
  if (apiDown) return <Outlet />

  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
