import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Radio, Truck, Users, MapPin,
  AlertTriangle, BarChart3, Settings, Antenna,
} from 'lucide-react'
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

export function AppSidebar() {
  const newAlertCount = usePositionsStore(s => s.newAlertCount)
  const clearAlerts   = usePositionsStore(s => s.clearAlerts)

  return (
    <nav
      style={{
        position: 'fixed',
        top: '12px',
        left: '12px',
        width: '250px',
        height: 'calc(100vh - 24px)',
        background: 'var(--sidebar)',
        borderRadius: '1rem',
        boxShadow: '0 0 2rem 0 rgba(136, 152, 170, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        zIndex: 50,
      }}
    >
      {/* Logo area */}
      <div
        style={{
          padding: '1.25rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          borderBottom: '1px solid var(--sidebar-border)',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '0.75rem',
            background: 'linear-gradient(310deg, #0d2055 0%, #1a4fc4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Antenna style={{ width: '18px', height: '18px', color: 'white' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--sidebar-foreground)',
            }}
          >
            TORRE DE CONTROLE
          </span>
          <span
            style={{
              fontSize: '10px',
              letterSpacing: '0.05em',
              color: 'var(--sidebar-primary)',
            }}
          >
            DE ENTREGAS
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, padding: '0.75rem 0' }}>
        <p
          style={{
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            opacity: 0.6,
            padding: '0.25rem 1.5rem 0.5rem',
            color: 'var(--sidebar-foreground)',
            marginTop: '0.5rem',
          }}
        >
          Menu
        </p>

        {navItems.map(({ to, label, icon: Icon }) => {
          // Real-time alert badge — clear on click
          const badge = to === '/alertas' && newAlertCount > 0 ? newAlertCount : undefined
          return (
            <NavLink
              key={to}
              to={to}
              onClick={() => to === '/alertas' && clearAlerts()}
              style={{ textDecoration: 'none', display: 'block', margin: '1px 8px' }}
            >
              {({ isActive }) => (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: isActive
                      ? 'linear-gradient(310deg, #0d2055 0%, #1a4fc4 100%)'
                      : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--sidebar-accent)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {/* Icon wrapper */}
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '0.75rem',
                      flexShrink: 0,
                      background: isActive
                        ? 'rgba(255, 255, 255, 0.2)'
                        : 'var(--sidebar-accent)',
                    }}
                  >
                    <Icon
                      style={{
                        width: '14px',
                        height: '14px',
                        color: isActive ? 'white' : 'var(--sidebar-primary)',
                      }}
                    />
                  </div>

                  <span
                    style={{
                      flex: 1,
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'white' : 'var(--sidebar-foreground)',
                    }}
                  >
                    {label}
                  </span>

                  {badge !== undefined && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        borderRadius: '9999px',
                        background: isActive ? 'rgba(255,255,255,0.25)' : '#ef4444',
                        padding: '1px 7px',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: 'white',
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </div>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
