import { create } from 'zustand'

interface ThemeStore {
  isDark: boolean
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  isDark: document.documentElement.classList.contains('dark'),
  toggleTheme: () =>
    set((s) => {
      const next = !s.isDark
      document.documentElement.classList.toggle('dark', next)
      localStorage.setItem('theme', next ? 'dark' : 'light')
      return { isDark: next }
    }),
}))
