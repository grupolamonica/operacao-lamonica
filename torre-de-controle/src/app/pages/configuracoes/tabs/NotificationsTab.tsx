import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, BellOff, AlertCircle, Smartphone } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

import { api } from '@/lib/api'
import { usePushSubscription, type PushStatus } from '@/hooks/usePushSubscription'
import { useUpdateMyPreferences, type NotificationPreferences } from '@/hooks/useUsers'
import { useAuthStore } from '@/stores/useAuthStore'

/**
 * Notifications tab — Phase 6, plan 06-06 (D-13, D-14, D-16).
 *
 * Two concerns wrapped in one tab:
 *   1. Push opt-in (browser permission + Service Worker register + subscribe)
 *   2. Per-severity preferences ({ critico, medio, baixo })
 *
 * Every authenticated user can configure their own preferences.
 * Backend dispatcher reads notification_preferences JSONB to decide who
 * receives a push for each alert severity.
 */

const statusLabel: Record<PushStatus, string> = {
  idle:        'Notificações não ativadas',
  enabling:    'Ativando notificações...',
  enabled:     'Notificações ativadas',
  denied:      'Permissão negada — habilite nas configurações do navegador',
  unsupported: 'Push não suportado neste navegador',
  error:       'Erro ao ativar notificações',
}

export function NotificationsTab() {
  const push          = usePushSubscription()
  const updatePrefs   = useUpdateMyPreferences()
  const { user: authUser } = useAuthStore()

  // Read current prefs from /api/auth/me — works for ALL roles (no admin gate).
  // Backend returns the authenticated user's full row including notificationPreferences.
  // Falls back to D-14 baseline { critico: true } if API is unreachable.
  const meQuery = useQuery({
    queryKey: ['auth', 'me-prefs'],
    queryFn:  async () => {
      const { data, error } = await (api.api.auth as any).me.get()
      if (error) return null
      // Server shape: { user: {...}, ... }
      const u = (data as any)?.user ?? data
      return (u?.notificationPreferences ?? null) as NotificationPreferences | null
    },
    retry:     false,
    staleTime: 30_000,
    enabled:   !!authUser,
  })

  const [prefs,     setPrefs]     = useState<NotificationPreferences>({ critico: true, medio: false, baixo: false })
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt,   setSavedAt]   = useState<number | null>(null)

  // Hydrate prefs from server when /api/auth/me returns the row.
  useEffect(() => {
    if (meQuery.data) {
      setPrefs({
        critico: meQuery.data.critico ?? true,
        medio:   meQuery.data.medio   ?? false,
        baixo:   meQuery.data.baixo   ?? false,
      })
    }
  }, [meQuery.data?.critico, meQuery.data?.medio, meQuery.data?.baixo])

  async function savePrefs() {
    setSaveError(null)
    setSavedAt(null)
    try {
      await updatePrefs.mutateAsync(prefs)
      setSavedAt(Date.now())
    } catch (e: any) {
      setSaveError(e?.message ?? 'Falha ao salvar preferências')
    }
  }

  const canEnable  = push.status === 'idle' || push.status === 'error'
  const isEnabling = push.status === 'enabling'

  return (
    <Card className="p-5 bg-card space-y-6">
      {/* ── Push opt-in section ─────────────────────────────────────────── */}
      <section>
        <header className="mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notificações no navegador
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Receba alertas críticos mesmo com a aba em background.
          </p>
        </header>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={push.enablePush}
            disabled={!canEnable || push.status === 'enabled' || push.status === 'unsupported' || push.status === 'denied'}
            className="gap-2"
          >
            <Bell className="h-3.5 w-3.5" />
            {isEnabling ? 'Ativando...' : push.status === 'enabled' ? 'Notificações Ativadas' : 'Ativar Notificações'}
          </Button>

          {push.status === 'enabled' && (
            <Button variant="outline" onClick={push.disablePush} className="gap-2">
              <BellOff className="h-3.5 w-3.5" />
              Desativar
            </Button>
          )}

          <span className={`text-xs ${push.status === 'enabled' ? 'text-success' : 'text-muted-foreground'}`}>
            {statusLabel[push.status]}
          </span>
        </div>

        {push.error && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{push.error}</span>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground flex items-start gap-1.5">
          <Smartphone className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          No iOS Safari, instale como App na tela inicial para receber notificações (Web Push API limitação).
        </p>
      </section>

      {/* ── Per-severity preferences ────────────────────────────────────── */}
      <section className="border-t border-border pt-5">
        <header className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Preferências por severidade</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Escolha quais severidades disparam notificações para você.
          </p>
        </header>

        <div className="space-y-3">
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <Checkbox
              checked={prefs.critico ?? false}
              onCheckedChange={(v) => setPrefs(p => ({ ...p, critico: Boolean(v) }))}
            />
            <span className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-destructive" />
              <span className="text-foreground font-medium">Críticos</span>
              <span className="text-muted-foreground text-xs">— Atrasos graves, paradas longas, desvios</span>
            </span>
          </label>

          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <Checkbox
              checked={prefs.medio ?? false}
              onCheckedChange={(v) => setPrefs(p => ({ ...p, medio: Boolean(v) }))}
            />
            <span className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-warning" />
              <span className="text-foreground font-medium">Médios</span>
              <span className="text-muted-foreground text-xs">— Alertas de risco operacional</span>
            </span>
          </label>

          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <Checkbox
              checked={prefs.baixo ?? false}
              onCheckedChange={(v) => setPrefs(p => ({ ...p, baixo: Boolean(v) }))}
            />
            <span className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-info" />
              <span className="text-foreground font-medium">Baixos</span>
              <span className="text-muted-foreground text-xs">— Avisos informativos</span>
            </span>
          </label>
        </div>

        {saveError && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {saveError}
          </div>
        )}
        {savedAt && !saveError && (
          <div className="mt-3 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
            Preferências salvas
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={savePrefs} disabled={updatePrefs.isPending}>
            {updatePrefs.isPending ? 'Salvando...' : 'Salvar preferências'}
          </Button>
        </div>
      </section>
    </Card>
  )
}
