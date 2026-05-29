import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * PanelCard — the single, canonical Argon surface used by every dashboard panel
 * (charts, tables, summaries). One component = one visual standard: change it here
 * and every Insights card + DataTable updates together.
 *
 * Argon style: rounded 1rem, soft ambient shadow, optional header with a left
 * title and a right-aligned slot (subtitle text or an action node), separated
 * by a hairline border.
 *
 * Usage:
 *   <PanelCard title="SLA Histórico" subtitle="% no prazo">
 *     <div style={{ height: 300 }}>{chart}</div>
 *   </PanelCard>
 *
 *   // tables manage their own internal padding → noPadding
 *   <PanelCard title="Rotas" subtitle="Top 20" noPadding>{table}</PanelCard>
 */
export interface PanelCardProps {
  title?: React.ReactNode
  /** Right-aligned muted text in the header (e.g. "% no prazo"). */
  subtitle?: React.ReactNode
  /** Right-aligned interactive slot in the header (overrides subtitle if both set). */
  action?: React.ReactNode
  /** Skip the inner body padding (tables/toolbars manage their own). */
  noPadding?: boolean
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

export function PanelCard({
  title,
  subtitle,
  action,
  noPadding = false,
  className,
  bodyClassName,
  children,
}: PanelCardProps) {
  const hasHeader = title != null || subtitle != null || action != null

  return (
    <div
      data-slot="panel-card"
      className={cn('flex flex-col bg-card overflow-hidden w-full', className)}
      style={{
        borderRadius: '1rem',
        boxShadow: '0 0 2rem 0 rgba(136, 152, 170, 0.15)',
        border: 'none',
      }}
    >
      {hasHeader && (
        <div
          className="flex items-center justify-between gap-3 px-5 py-3.5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {title != null && (
            <h3 className="text-sm font-semibold text-foreground leading-none">{title}</h3>
          )}
          {action != null ? (
            <div className="flex items-center gap-2">{action}</div>
          ) : subtitle != null ? (
            <span className="text-xs text-muted-foreground leading-none">{subtitle}</span>
          ) : null}
        </div>
      )}

      <div className={cn('flex-1 min-h-0', noPadding ? '' : 'p-5', bodyClassName)}>
        {children}
      </div>
    </div>
  )
}
