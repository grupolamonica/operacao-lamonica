import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

/**
 * Web Push subscription hook — Phase 6, plan 06-06.
 *
 * State machine for the push opt-in flow:
 *   idle        → user hasn't enabled; show "Ativar notificações"
 *   enabling    → in-flight: register SW, request permission, subscribe
 *   enabled     → subscription persisted server-side
 *   denied      → Notification.permission === 'denied'
 *   unsupported → browser lacks ServiceWorker or PushManager
 *   error       → registration / subscribe / API call failed
 *
 * Wraps:
 *   - navigator.serviceWorker.register('/sw.js', { scope: '/' })  — CRITICAL scope:'/'
 *     so SW receives push events regardless of base path (RESEARCH Pitfall #2)
 *   - registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
 *   - POST /api/push/subscribe   (api.api.push.subscribe.post)
 *   - POST /api/push/unsubscribe (api.api.push.unsubscribe.post)
 *
 * VAPID public key fetched from server at runtime when env var unset — falls
 * back to /api/push/vapid-public-key so the frontend doesn't need the key at
 * build time. import.meta.env.VITE_VAPID_PUBLIC_KEY takes precedence if set.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)))
}

export type PushStatus = 'idle' | 'enabling' | 'enabled' | 'denied' | 'unsupported' | 'error'

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>('idle')
  const [error,  setError]  = useState<string | null>(null)

  // Detect current state on mount: unsupported / denied / already-enabled.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }
    navigator.serviceWorker
      .getRegistration('/sw.js')
      .then(async (reg) => {
        if (!reg) return
        const sub = await reg.pushManager.getSubscription()
        if (sub) setStatus('enabled')
      })
      .catch(() => {
        /* swallow — no existing registration is fine */
      })
  }, [])

  async function enablePush() {
    setStatus('enabling')
    setError(null)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications não suportadas neste browser')
      }

      // Get VAPID public key — env first, fallback to server endpoint.
      let publicKey = VAPID_PUBLIC_KEY
      if (!publicKey) {
        const { data, error: keyErr } = await (api.api.push as any)['vapid-public-key'].get()
        if (keyErr || !(data as any)?.publicKey) {
          throw new Error('VAPID public key não disponível')
        }
        publicKey = (data as any).publicKey as string
      }

      // Register Service Worker with explicit root scope (Pitfall #2).
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      // Request permission AFTER registering SW.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        throw new Error('Permissão de notificação negada')
      }

      // Subscribe to push (reuse existing subscription if present).
      let subscription = await reg.pushManager.getSubscription()
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }

      const json = subscription.toJSON()
      const keys = (json.keys ?? {}) as { p256dh?: string; auth?: string }
      if (!keys.p256dh || !keys.auth) {
        throw new Error('Subscription incompleta — keys.p256dh/auth ausentes')
      }

      // Persist subscription server-side. userId comes from JWT cookie (T-06.04-01).
      const { error: apiError } = await (api.api.push as any).subscribe.post({
        endpoint: subscription.endpoint,
        keys:     { p256dh: keys.p256dh, auth: keys.auth },
      })
      if (apiError) {
        throw new Error('Falha ao registrar subscription no servidor')
      }

      setStatus('enabled')
    } catch (e: any) {
      // Don't overwrite 'denied' status with 'error' for explicit permission rejection.
      setStatus((prev) => (prev === 'denied' ? 'denied' : 'error'))
      setError(e?.message ?? 'Erro desconhecido')
    }
  }

  async function disablePush() {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      if (!reg) {
        setStatus('idle')
        return
      }
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await (api.api.push as any).unsubscribe.post({ endpoint })
      }
      setStatus('idle')
      setError(null)
    } catch (e: any) {
      setStatus('error')
      setError(e?.message ?? 'Erro ao desativar')
    }
  }

  return { status, error, enablePush, disablePush }
}
