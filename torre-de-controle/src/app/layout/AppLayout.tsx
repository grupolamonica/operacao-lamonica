import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { Topbar } from './Topbar'

export function AppLayout() {
  return (
    <div className="flex h-full" style={{ background: 'var(--app-background)' }}>
      {/* Floating sidebar */}
      <AppSidebar />

      {/* Main content area — offset by sidebar width + margins */}
      <div
        className="flex-1 flex flex-col min-h-screen relative"
        style={{ marginLeft: '274px' }}
      >
        {/* Dark top band — Argon signature gradient */}
        <div
          className="absolute top-0 left-0 right-0 z-0"
          style={{
            height: '200px',
            background: 'linear-gradient(310deg, #212229 0%, #212529 100%)',
          }}
        />

        {/* Topbar — sits on dark band */}
        <div className="relative z-10">
          <Topbar />
        </div>

        {/* Page content — overlaps dark band */}
        <main className="relative z-10 flex-1 px-6 pb-6" style={{ marginTop: '-20px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
