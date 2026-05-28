import { MapPin, Construction } from 'lucide-react'
import { Card } from '@/components/ui/card'

export function GeofencesPage() {
  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Geofences</h1>
          <p className="text-sm text-white/70">Zonas geográficas, eventos de entrada/saída e alertas territoriais</p>
        </div>
        <span
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)' }}
        >
          <Construction className="h-3.5 w-3.5" /> Disponível em Phase 5
        </span>
      </header>

      <Card className="p-8 text-center bg-card">
        <MapPin className="h-12 w-12 mx-auto text-primary mb-3" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Módulo Geofences</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
          A gestão de zonas geográficas (PostGIS) e eventos de entrada/saída será entregue na Phase 5.
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 max-w-sm mx-auto text-left list-disc list-inside">
          <li>Criar/editar zonas no mapa (polígono, círculo)</li>
          <li>Tipos: zona restrita, base, ponto de entrega, área de risco</li>
          <li>Histórico de entradas/saídas</li>
          <li>Alertas automáticos por geofence</li>
        </ul>
      </Card>
    </div>
  )
}
