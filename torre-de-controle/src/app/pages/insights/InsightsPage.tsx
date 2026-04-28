import { BarChart3, Construction } from 'lucide-react'
import { Card } from '@/components/ui/card'

export function InsightsPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
          <p className="text-sm text-gray-500">Analytics, tendências de SLA e ranking operacional</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-purple-50 text-purple-700 px-3 py-1 text-xs font-medium">
          <Construction className="h-3.5 w-3.5" /> Disponível em Phase 6
        </span>
      </header>

      <Card className="p-8 text-center bg-white">
        <BarChart3 className="h-12 w-12 mx-auto text-purple-500 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Módulo Insights</h2>
        <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
          Métricas históricas e exportações serão entregues na Phase 6 (Polish + Deploy).
        </p>
        <ul className="text-xs text-gray-500 space-y-1 max-w-sm mx-auto text-left list-disc list-inside">
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
