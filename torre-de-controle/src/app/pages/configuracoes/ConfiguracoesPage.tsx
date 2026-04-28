import { Settings, Construction } from 'lucide-react'
import { Card } from '@/components/ui/card'

export function ConfiguracoesPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground">Usuários, regras de alerta e integrações</p>
        </div>
        <span
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: 'var(--status-sem-sinal-bg)', color: 'var(--status-sem-sinal-fg)' }}
        >
          <Construction className="h-3.5 w-3.5" /> Disponível em Phase 6
        </span>
      </header>

      <Card className="p-8 text-center bg-card">
        <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Módulo Configurações</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
          Administração do sistema será entregue progressivamente entre Phase 2 (auth) e Phase 6 (operações).
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 max-w-sm mx-auto text-left list-disc list-inside">
          <li>Usuários e perfis de acesso (Phase 2)</li>
          <li>Regras de alerta (thresholds configuráveis) (Phase 4)</li>
          <li>Geofences padrão (Phase 5)</li>
          <li>Integrações com GPS providers (Phase 6)</li>
        </ul>
      </Card>
    </div>
  )
}
