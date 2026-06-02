/**
 * Cores semânticas Argon via TOKENS (não hex hardcoded).
 *
 * Padronização (auditoria Argon): telas novas devem usar estes helpers em vez de
 * `text-emerald-500`, `bg-[#2dce89]/15`, `bg-blue-500/15`, etc. Os valores saem
 * dos tokens oklch do tema (index.css: --success/--danger/--warning/--info/--muted).
 *
 * - `toneText[tone]`   → classe de cor de TEXTO (ex.: métricas, ícones).
 * - `toneBadge[tone]`  → classe de BADGE pill (bg suave + fg) p/ status.
 * - `TONE_VAR[tone]`    → a CSS var crua (p/ style inline dinâmico quando necessário).
 *
 * Charts (Chart.js) continuam usando hex direto — a lib não aceita CSS vars.
 */

export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary'

export const TONE_VAR: Record<StatusTone, string> = {
  success: 'var(--success)',
  danger:  'var(--destructive)',
  warning: 'var(--warning)',
  info:    'var(--info)',
  neutral: 'var(--muted-foreground)',
  primary: 'var(--primary)',
}

export const toneText: Record<StatusTone, string> = {
  success: 'text-[var(--success)]',
  danger:  'text-[var(--destructive)]',
  warning: 'text-[var(--warning)]',
  info:    'text-[var(--info)]',
  neutral: 'text-muted-foreground',
  primary: 'text-primary',
}

/** Badge pill suave (bg 15% + fg na cor cheia do tom). Combine com a base de pill. */
export const toneBadge: Record<StatusTone, string> = {
  success: 'bg-[var(--success)]/15 text-[var(--success)]',
  danger:  'bg-[var(--destructive)]/15 text-[var(--destructive)]',
  warning: 'bg-[var(--warning)]/15 text-[var(--warning)]',
  info:    'bg-[var(--info)]/15 text-[var(--info)]',
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/15 text-primary',
}

/** Classe base de um badge pill (combine com toneBadge[tone]). */
export const BADGE_BASE = 'inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium'
