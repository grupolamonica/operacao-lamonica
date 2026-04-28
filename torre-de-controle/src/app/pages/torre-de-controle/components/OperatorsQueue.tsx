import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface Operator {
  id: string
  name: string
  status: 'available' | 'busy' | 'offline'
  activeAlerts: number
}

const operators: Operator[] = [
  { id: 'op-001', name: 'Ana Silva',     status: 'busy',      activeAlerts: 3 },
  { id: 'op-002', name: 'Bruno Reis',    status: 'busy',      activeAlerts: 2 },
  { id: 'op-003', name: 'Carla Mendes',  status: 'available', activeAlerts: 0 },
  { id: 'op-004', name: 'Diego Tavares', status: 'available', activeAlerts: 0 },
  { id: 'op-005', name: 'Eduarda Pinto', status: 'offline',   activeAlerts: 0 },
]

const dotMap = {
  available: 'bg-[#2ecc71]',
  busy:      'bg-[#f39c12]',
  offline:   'bg-[#95a5a6]',
} as const

const labelMap = {
  available: 'Disponível',
  busy:      'Em atendimento',
  offline:   'Offline',
} as const

export function OperatorsQueue() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Fila de operadores</h3>
      <ul className="space-y-2">
        {operators.map(op => {
          const initials = op.name.split(' ').slice(0, 2).map(n => n[0]).join('')
          return (
            <li key={op.id} className="flex items-center gap-3 py-1.5">
              <div className="relative">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-gray-200 text-gray-700 text-xs">{initials}</AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    'absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-white',
                    dotMap[op.status],
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">{op.name}</p>
                <p className="text-xs text-gray-500">{labelMap[op.status]}</p>
              </div>
              {op.activeAlerts > 0 && (
                <span className="text-[10px] font-bold bg-[#0f62fe] text-white rounded-full px-2 py-0.5">
                  {op.activeAlerts}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
