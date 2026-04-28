import { X } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

interface Props {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}

export function SidePanelLayout({ title, subtitle, onClose, children, footer }: Props) {
  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden shadow-lg">
      <div className="flex items-start justify-between p-4 shrink-0 border-b border-border">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground truncate">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          className="ml-2 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Fechar painel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ScrollArea className="flex-1 p-4">
        {children}
      </ScrollArea>
      {footer && (
        <>
          <Separator />
          <div className="p-4 shrink-0 bg-secondary/40">{footer}</div>
        </>
      )}
    </div>
  )
}
