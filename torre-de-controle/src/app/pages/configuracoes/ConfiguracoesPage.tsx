import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UsersTab } from './tabs/UsersTab'
import { AlertThresholdsTab } from './tabs/AlertThresholdsTab'
import { NotificationsTab } from './tabs/NotificationsTab'
import { GpsProvidersTab } from './tabs/GpsProvidersTab'

/**
 * Configurações page — Phase 6, plan 06-06.
 *
 * 4 tabs per D-17:
 *   - Usuários (admin only — CRUD)
 *   - Alertas (admin only — global thresholds)
 *   - Notificações (any user — push opt-in + per-severity prefs)
 *   - Integrações GPS (admin only — provider stubs)
 *
 * RBAC is enforced server-side (requireRole('admin')). Client-side hides
 * write controls based on useAuthStore().user.role; reads remain available
 * to all authenticated users so they can see existing data.
 */
export function ConfiguracoesPage() {
  return (
    <div className="space-y-5">
      <header className="pb-4">
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-white/70">Usuários, regras de alerta, notificações e integrações</p>
      </header>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="thresholds">Alertas</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="gps">Integrações GPS</TabsTrigger>
        </TabsList>

        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="thresholds"><AlertThresholdsTab /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        <TabsContent value="gps"><GpsProvidersTab /></TabsContent>
      </Tabs>
    </div>
  )
}
