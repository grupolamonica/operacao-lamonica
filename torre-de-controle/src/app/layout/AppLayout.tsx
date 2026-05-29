import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AppSidebar } from './AppSidebar'
import { Topbar } from './Topbar'
import { useVehiclePositions, usePositionsStore } from '@/hooks/useVehiclePositions'

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
    <div className="relative flex h-full" style={{ background: 'var(--app-background)' }}>
      {/* Full-width dark top band — absolute, scrolls with content, covers full width */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: '280px',
          background: 'var(--dark-band)',
          zIndex: 0,
        }}
      />

      {/* Floating sidebar — on top of dark band */}
      <AppSidebar />

      {/* Main content area — offset by sidebar width + margins */}
      <div
        className="flex-1 flex flex-col min-h-screen relative overflow-x-hidden"
        style={{ marginLeft: '274px', zIndex: 1 }}
      >
        {/* Topbar — sits on dark band */}
        <div className="relative">
          <Topbar />
        </div>

        {/* Page content */}
        <main className="relative flex-1 px-6 pb-6 pt-2">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
