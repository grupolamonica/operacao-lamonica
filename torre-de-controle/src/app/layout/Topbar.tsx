import { Bell, Sun, Moon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useThemeStore } from '@/stores/useThemeStore'
import { useLocation } from 'react-router-dom'

const routeNames: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/torre-de-controle': 'Torre de Controle',
  '/viagens': 'Viagens',
  '/motoristas': 'Motoristas',
  '/alertas': 'Alertas',
  '/geofences': 'Geofences',
  '/insights': 'Insights',
  '/configuracoes': 'Configurações',
}

export function Topbar() {
  const { isDark, toggleTheme } = useThemeStore()
  const { pathname } = useLocation()
  const currentPage = routeNames[pathname] ?? 'Dashboard'

  return (
    <nav
      style={{ background: 'transparent' }}
      className="flex items-center justify-between px-6 py-3"
    >
      {/* Left: sidebar trigger + breadcrumb */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-white hover:bg-white/10" />
        <p className="text-white/60 text-xs mb-0 leading-none">Páginas / {currentPage}</p>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: 'white' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-400" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'white' }}
          aria-label="Alternar tema"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback
              style={{ background: 'linear-gradient(310deg, #5e72e4 0%, #825ee4 100%)' }}
              className="text-white text-xs font-bold"
            >
              AS
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold text-white">Ana Silva</span>
            <span className="text-[10px] text-white/60">Torre de Controle</span>
          </div>
        </div>
      </div>
    </nav>
  )
}
