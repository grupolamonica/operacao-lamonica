import { create } from 'zustand'
import { api } from '@/lib/api'

export type AuthUser = { id: string; name: string; email: string; role: string }

type AuthStore = {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  me: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true })
    const { data, error } = await api.api.auth.login.post({ email, password })
    set({ isLoading: false })
    if (error) return (error.value as any)?.error ?? 'Login failed'
    set({ user: (data as any).user })
    return null
  },

  logout: async () => {
    await api.api.auth.logout.post()
    set({ user: null })
  },

  me: async () => {
    const { data, error } = await api.api.auth.me.get()
    if (!error && data) {
      // me returns { id, role } — enrich via user already stored if available
      set(s => ({ user: s.user ? { ...s.user, ...(data as any).user } : (data as any).user }))
    }
  },
}))
