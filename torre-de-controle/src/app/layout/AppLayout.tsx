import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { Topbar } from './Topbar'
import { useVehiclePositions, usePositionsStore } from '@/hooks/useVehiclePositions'

/**
 * Root authenticated layout (Phase 6 / D-22).
 *
 * Refactored from fixed `marginLeft: '274px'` to shadcn `SidebarProvider`+`SidebarInset`,
 * which provides responsive collapse behaviour (icon mode <1280px) for tablet+ devices.
 * SidebarProvider owns sidebar open/collapsed state — never duplicated in useUIStore.
 */
export function AppLayout() {
  useVehiclePositions()
  const queryClient   = useQueryClient()
  const newAlertCount = usePositionsStore(s => s.newAlertCount)

  // Invalidate alerts query when new alert arrives so the list auto-refreshes
  useEffect(() => {
    if (newAlertCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['alerts-kpis'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] })
    }
  }, [newAlertCount, queryClient])

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />

      <SidebarInset
        className="relative flex flex-col min-h-screen overflow-x-hidden"
        style={{ background: 'var(--app-background)' }}
      >
        {/* Full-width dark top band — preserves Argon visual identity */}
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none"
          style={{
            height: '280px',
            background: 'var(--dark-band)',
            zIndex: 0,
          }}
        />

        {/* Topbar sits on dark band */}
        <div className="relative z-10">
          <Topbar />
        </div>

        {/* Page content */}
        <main className="relative z-10 flex-1 px-6 pb-6 pt-2">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
