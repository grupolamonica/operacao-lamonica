import { Sun, Moon, LogOut, RefreshCw } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { NotificationsDropdown } from '@/components/domain/NotificationsDropdown'
import { useThemeStore } from '@/stores/useThemeStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useSyncAll, useSyncStatus } from '@/hooks/useSync'
import { formatRelative } from '@/lib/formatters'
import { useLocation, useNavigate } from 'react-router-dom'

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  analyst: 'Analista',
  viewer: 'Visualizador',
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?'
}

const routeNames: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/torre-de-controle': 'Torre de Controle',
  '/viagens': 'Viagens',
  '/motoristas': 'Motoristas',
  '/alertas': 'Alertas',
  '/gr': 'Gerenciamento de Risco',
  '/geofences': 'Geofences',
  '/insights': 'Insights',
  '/configuracoes': 'Configurações',
}

export function Topbar() {
  const { isDark, toggleTheme } = useThemeStore()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const syncAll = useSyncAll()
  const { data: syncStatus } = useSyncStatus()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }
  const sincronizando = syncAll.isPending || syncStatus.running
  const ultimaSync = syncStatus.last?.finishedAt ? formatRelative(syncStatus.last.finishedAt) : null
  const syncTitle = sincronizando
    ? 'Sincronizando planilha + Cargas + Angellira… (~2 min)'
    : ultimaSync ? `Sincronizar agora · última: ${ultimaSync}` : 'Sincronizar agora (planilha + Cargas + Angellira)'
  const currentPage = routeNames[pathname] ?? 'Dashboard'
  const nome = user?.name ?? user?.email ?? 'Operador'
  const papel = user?.role ? (roleLabels[user.role] ?? user.role) : 'Torre de Controle'

  return (
    <nav
      style={{ background: 'transparent' }}
      className="flex items-center justify-between px-6 py-3"
    >
      {/* Left: breadcrumb only */}
      <div>
        <p className="text-white/60 text-xs mb-0 leading-none">Páginas / {currentPage}</p>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Sincronizar agora — planilha do painel + Cargas + Angellira → Torre */}
        <button
          onClick={() => { if (!sincronizando) syncAll.mutate() }}
          disabled={sincronizando}
          className="flex items-center gap-1.5 p-2 rounded-lg transition-colors disabled:opacity-70"
          style={{ color: 'white' }}
          aria-label="Sincronizar agora"
          title={syncTitle}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <RefreshCw className={`h-4 w-4 ${sincronizando ? 'animate-spin' : ''}`} />
          {ultimaSync && !sincronizando && (
            <span className="text-[10px] text-white/60 hidden lg:inline">{ultimaSync}</span>
          )}
        </button>

        {/* Notification bell — ocorrências abertas, deep-link p/ /alertas */}
        <NotificationsDropdown />

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
              {initials(nome)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold text-white">{nome}</span>
            <span className="text-[10px] text-white/60">{papel}</span>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'white' }}
          aria-label="Sair"
          title="Sair"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </nav>
  )
}
