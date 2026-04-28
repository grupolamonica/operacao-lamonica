import { NavLink } from 'react-router-dom'
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup,
} from '@/components/ui/sidebar'
import {
  LayoutDashboard, Radio, Truck, Users, MapPin,
  AlertTriangle, BarChart3, Settings, ChevronLeft, Antenna,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard',         label: 'Dashboard',          icon: LayoutDashboard },
  { to: '/torre-de-controle', label: 'Torre de Controle',  icon: Radio },
  { to: '/viagens',           label: 'Viagens',            icon: Truck },
  { to: '/motoristas',        label: 'Motoristas',         icon: Users },
  { to: '/geofences',         label: 'Geofences',          icon: MapPin },
  { to: '/alertas',           label: 'Alertas',            icon: AlertTriangle, badge: 12 },
  { to: '/insights',          label: 'Insights',           icon: BarChart3 },
  { to: '/configuracoes',     label: 'Configurações',      icon: Settings },
] as const

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="bg-[#1a1a2e]">
        <div className="flex items-center gap-2 px-3 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#0f62fe]">
            <Antenna className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-[11px] font-bold tracking-widest text-white">TORRE DE CONTROLE</span>
            <span className="text-[10px] tracking-widest text-[#0f62fe]">DE ENTREGAS</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-[#1a1a2e]">
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map(({ to, label, icon: Icon, ...rest }) => {
              const badge = 'badge' in rest ? rest.badge : undefined
              return (
                <SidebarMenuItem key={to}>
                  <NavLink to={to}>
                    {({ isActive }) => (
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className={cn(
                          'text-[#8892b0] hover:bg-white/8 hover:text-white',
                          'data-[active=true]:bg-[#0f62fe] data-[active=true]:text-white'
                        )}
                      >
                        <span className="flex items-center gap-3 w-full">
                          <Icon className="h-4 w-4" />
                          <span className="flex-1 group-data-[collapsible=icon]:hidden">{label}</span>
                          {badge !== undefined && (
                            <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white group-data-[collapsible=icon]:hidden">
                              {badge}
                            </span>
                          )}
                        </span>
                      </SidebarMenuButton>
                    )}
                  </NavLink>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="bg-[#1a1a2e]">
        <button
          className="flex items-center gap-2 px-3 py-2 text-xs text-[#8892b0] hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">Recolher menu</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  )
}
