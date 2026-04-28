import { BarChart3, Construction } from 'lucide-react'
import { Card } from '@/components/ui/card'

export function InsightsPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Insights</h1>
          <p className="text-sm text-muted-foreground">Analytics, tendências de SLA e ranking operacional</p>
        </div>
        <span
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: 'oklch(0.95 0.04 300)', color: 'oklch(0.45 0.15 300)' }}
        >
          <Construction className="h-3.5 w-3.5" /> Disponível em Phase 6
        </span>
      </header>

      <Card className="p-8 text-center bg-card">
        <BarChart3 className="h-12 w-12 mx-auto text-primary mb-3" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Módulo Insights</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
          Métricas históricas e exportações serão entregues na Phase 6 (Polish + Deploy).
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 max-w-sm mx-auto text-left list-disc list-inside">
          <li>Métricas históricas de performance</li>
          <li>Tendências de SLA</li>
          <li>Ranking de motoristas</li>
          <li>Análise de rotas problemáticas</li>
          <li>Exportação CSV</li>
        </ul>
      </Card>
    </div>
  )
}
