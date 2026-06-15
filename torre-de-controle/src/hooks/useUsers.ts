import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/**
 * Users hooks — Phase 6, plan 06-06.
 *
 * Wraps Eden Treaty endpoints from api/src/modules/users/users.plugin.ts:
 *   GET    /api/users                          (admin only — list)
 *   POST   /api/users                          (admin only — create)
 *   PATCH  /api/users/:id                      (admin only — role/isActive/prefs)
 *   DELETE /api/users/:id                      (admin only — SOFT delete via deactivate)
 *   PATCH  /api/users/me/notification-preferences (any authenticated user)
 *
 * RBAC enforcement happens server-side via authGuard + requireRole('admin').
 * Client-side UI hides admin controls but server is source of truth.
 */
export type UserRole = 'admin' | 'supervisor' | 'analyst' | 'viewer'

export type NotificationPreferences = {
  critico?: boolean
  medio?:   boolean
  baixo?:   boolean
  // "Marcar como lida" do sino — instante (ISO) em que o usuário viu as notificações.
  seenAt?:  string
}

export type User = {
  id:                       string
  name:                     string
  email:                    string
  role:                     UserRole
  isActive:                 boolean
  notificationPreferences:  NotificationPreferences | null
  createdAt:                string
}

export type CreateUserInput = {
  name:     string
  email:    string
  role:     UserRole
  password: string
}

export type UpdateUserInput = {
  role?:                     UserRole
  isActive?:                 boolean
  notificationPreferences?:  NotificationPreferences
}

export function useUsers() {
  const q = useQuery({
    queryKey: ['users'],
    queryFn:  async () => {
      const { data, error } = await (api.api.users as any).get()
      if (error) {
        const msg = (error.value as any)?.error ?? 'Failed to fetch users'
        throw new Error(msg)
      }
      return (data ?? []) as User[]
    },
    // List endpoint is admin-only (server 403 for non-admin). Don't retry —
    // a single 403 is enough to know the caller lacks permission.
    retry: false,
  })
  return {
    data:      q.data ?? [],
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const { data, error } = await (api.api.users as any).post(input)
      if (error) {
        const msg = (error.value as any)?.error ?? 'Create failed'
        throw new Error(msg)
      }
      return data as User
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateUserInput }) => {
      const { data, error } = await (api.api.users as any)[id].patch(patch)
      if (error) {
        const msg = (error.value as any)?.error ?? 'Update failed'
        throw new Error(msg)
      }
      return data as User
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useDeactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (api.api.users as any)[id].delete()
      if (error) {
        const msg = (error.value as any)?.error ?? 'Deactivate failed'
        throw new Error(msg)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateMyPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (prefs: NotificationPreferences) => {
      const { data, error } = await (api.api.users as any).me['notification-preferences'].patch(prefs)
      if (error) {
        const msg = (error.value as any)?.error ?? 'Update preferences failed'
        throw new Error(msg)
      }
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

// Usuário autenticado atual (inclui notificationPreferences.seenAt p/ o sino).
export function useMe() {
  const q = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const { data, error } = await api.api.auth.me.get()
      if (error) throw new Error('Failed to fetch current user')
      return ((data as any)?.user ?? null) as (User & { notificationPreferences: NotificationPreferences | null }) | null
    },
    staleTime: 60_000,
  })
  return { data: q.data ?? null, isLoading: q.isLoading }
}

// "Marcar todas como lidas" — carimba seenAt=agora no servidor; otimista no cache.
export function useMarkNotificationsSeen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await (api.api.users as any).me['notifications-seen'].post()
      if (error) {
        const msg = (error.value as any)?.error ?? 'Mark notifications seen failed'
        throw new Error(msg)
      }
      return data
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['auth-me'] })
      const prev = qc.getQueryData(['auth-me'])
      const nowIso = new Date().toISOString()
      qc.setQueryData(['auth-me'], (u: any) =>
        u ? { ...u, notificationPreferences: { ...(u.notificationPreferences ?? {}), seenAt: nowIso } } : u,
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev !== undefined) qc.setQueryData(['auth-me'], ctx.prev) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['auth-me'] }),
  })
}
