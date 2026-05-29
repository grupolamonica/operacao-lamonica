import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Radio, Truck, Users, MapPin,
  AlertTriangle, BarChart3, Settings, Antenna,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from '@/components/ui/sidebar'
import { usePositionsStore } from '@/hooks/useVehiclePositions'

const navItems = [
  { to: '/dashboard',         label: 'Dashboard',          icon: LayoutDashboard },
  { to: '/torre-de-controle', label: 'Torre de Controle',  icon: Radio },
  { to: '/viagens',           label: 'Viagens',            icon: Truck },
  { to: '/motoristas',        label: 'Motoristas',         icon: Users },
  { to: '/geofences',         label: 'Geofences',          icon: MapPin },
  { to: '/alertas',           label: 'Alertas',            icon: AlertTriangle },
  { to: '/insights',          label: 'Insights',           icon: BarChart3 },
  { to: '/configuracoes',     label: 'Configurações',      icon: Settings },
] as const

/**
 * Application sidebar (Phase 6 / D-22).
 *
 * Wrapped in shadcn `<Sidebar collapsible="icon">` to support icon-only collapse
 * on tablet (<1280px) while preserving Argon dark-navy branding through CSS
 * variables (`var(--sidebar)` etc) defined in index.css.
 *
 * `SidebarMenuButton` carries `tooltip` so collapsed-mode users still see labels.
 */
export function AppSidebar() {
  const newAlertCount = usePositionsStore(s => s.newAlertCount)
  const clearAlerts   = usePositionsStore(s => s.clearAlerts)

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border"
    >
      {/* Brand header */}
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'linear-gradient(310deg, #0d2055 0%, #1a4fc4 100%)' }}
          >
            <Antenna className="h-4 w-4 text-white" />
          </div>
          {/* Hide text when sidebar is collapsed to icon mode */}
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-[11px] font-bold tracking-[0.08em] text-sidebar-foreground">
              TORRE DE CONTROLE
            </span>
            <span className="text-[10px] tracking-[0.05em] text-sidebar-primary">
              DE ENTREGAS
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {navItems.map(({ to, label, icon: Icon }) => {
            const badge = to === '/alertas' && newAlertCount > 0 ? newAlertCount : undefined
            return (
              <SidebarMenuItem key={to}>
                <NavLink
                  to={to}
                  onClick={() => { if (to === '/alertas') clearAlerts() }}
                  className="block"
                >
                  {({ isActive }) => (
                    <>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={label}
                        className={
                          isActive
                            ? 'data-[active=true]:bg-[linear-gradient(310deg,#0d2055_0%,#1a4fc4_100%)] data-[active=true]:text-white'
                            : ''
                        }
                      >
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </SidebarMenuButton>
                      {badge !== undefined && (
                        <SidebarMenuBadge
                          className="bg-[#ef4444] text-white"
                          aria-label={`${badge} novos alertas`}
                        >
                          {badge}
                        </SidebarMenuBadge>
                      )}
                    </>
                  )}
                </NavLink>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  )
}
