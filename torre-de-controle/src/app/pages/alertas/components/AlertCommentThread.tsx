import { useState } from 'react'
import { MessageSquare, ArrowRightCircle, UserCog, FileEdit, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/formatters'
import type { AlertHistoryItem } from '@/hooks/useAlertWorkflow'

interface Props {
  items:      AlertHistoryItem[]
  onSubmit:   (text: string) => void
  isPending:  boolean
}

function iconFor(actionType: string | null) {
  if (!actionType) return MessageSquare
  if (actionType === 'comment')        return MessageSquare
  if (actionType.startsWith('transition:')) return ArrowRightCircle
  if (actionType === 'assign')         return UserCog
  return FileEdit
}

function labelFor(actionType: string | null) {
  if (!actionType) return 'Tratativa'
  if (actionType === 'comment')  return 'Comentário'
  if (actionType === 'assign')   return 'Atribuição'
  if (actionType.startsWith('transition:')) {
    const [, payload] = actionType.split(':')
    const [from, , to] = payload?.split('_') ?? []
    return `${from ?? ''} → ${to ?? ''}`.replace(/em/gi, 'em ')
  }
  return actionType
}

export function AlertCommentThread({ items, onSubmit, isPending }: Props) {
  const [text, setText] = useState('')

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed || isPending) return
    onSubmit(trimmed)
    setText('')
  }

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">Histórico</h4>

      {items.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Sem comentários ou tratativas registrados ainda.</p>
      )}

      <ol className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {items.map((it) => {
          const Icon = iconFor(it.actionType)
          return (
            <li key={it.id} className="flex gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-foreground">{labelFor(it.actionType)}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatRelative(it.createdAt)}</span>
                </div>
                {it.notes && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">{it.notes}</p>}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit() }}
          placeholder="Adicionar comentário... (⌘/Ctrl + Enter para enviar)"
          rows={2}
          className="flex-1 text-xs rounded-md border border-border bg-background px-2 py-1.5 resize-none outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Button size="sm" onClick={handleSubmit} disabled={!text.trim() || isPending} className="self-end gap-1.5">
          <Send className="h-3.5 w-3.5" /> Enviar
        </Button>
      </div>
    </div>
  )
}
