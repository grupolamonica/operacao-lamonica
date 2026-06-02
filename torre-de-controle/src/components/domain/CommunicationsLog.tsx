import { Phone, MessageSquare, MessageCircle, FileEdit, PhoneIncoming, PhoneMissed, PhoneOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/lib/formatters'
import { useCommunications, type CommScope, type Channel, type Outcome } from '@/hooks/useCommunications'

const CHANNEL_ICON: Record<Channel, typeof Phone> = {
  call:     Phone,
  sms:      MessageSquare,
  whatsapp: MessageCircle,
  note:     FileEdit,
}

const CHANNEL_LABEL: Record<Channel, string> = {
  call:     'Ligação',
  sms:      'SMS',
  whatsapp: 'WhatsApp',
  note:     'Observação',
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  atendida:     'Atendida',
  nao_atendida: 'Não atendida',
  caixa_postal: 'Caixa postal',
  enviada:      'Enviada',
  recebida:     'Recebida',
}

const OUTCOME_TONE: Record<Outcome, string> = {
  atendida:     'text-success',
  nao_atendida: 'text-warning',
  caixa_postal: 'text-muted-foreground',
  enviada:      'text-info',
  recebida:     'text-info',
}

function formatDuration(sec: number | null): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m${s.toString().padStart(2, '0')}s` : `${s}s`
}

interface Props {
  scope: CommScope
  emptyMessage?: string
}

export function CommunicationsLog({ scope, emptyMessage = 'Nenhuma comunicação registrada ainda.' }: Props) {
  const { data, isLoading } = useCommunications(scope)

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando comunicações...
      </div>
    )
  }
  if (!data || data.length === 0) {
    return <p className="text-xs text-muted-foreground italic">{emptyMessage}</p>
  }

  return (
    <ol className="space-y-2">
      {data.map((c) => {
        const Icon  = CHANNEL_ICON[c.channel] ?? Phone
        const DirIcon = c.channel === 'call'
          ? (c.outcome === 'nao_atendida' ? PhoneMissed : c.outcome === 'caixa_postal' ? PhoneOff : c.direction === 'in' ? PhoneIncoming : Phone)
          : Icon
        return (
          <li key={c.id} className="flex gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <DirIcon className={cn('h-4 w-4 mt-0.5 shrink-0', c.outcome ? OUTCOME_TONE[c.outcome] : 'text-muted-foreground')} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-foreground">
                  {CHANNEL_LABEL[c.channel]}
                  {c.direction === 'in' && ' · recebida'}
                  {c.outcome && <span className={cn('ml-1.5', OUTCOME_TONE[c.outcome])}>· {OUTCOME_LABEL[c.outcome]}</span>}
                  {c.durationSec != null && <span className="text-muted-foreground"> · {formatDuration(c.durationSec)}</span>}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatRelative(c.occurredAt)}</span>
              </div>
              {c.content && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">{c.content}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
