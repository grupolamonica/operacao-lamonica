import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Filtro de Prazo Final (intervalo de datas) — réplica fiel do painel HTML:
//   "Prazo Final de: [data] até: [data]  [Limpar]"
// Filtra pela coluna Prazo Final (= trips.window_end). Mesma semântica do
// checkVisibilityDate(): prazo >= início(00:00) e prazo <= fim(23:59:59);
// sem datas = mostra tudo (Limpar). Único controle de período do sistema.

export type PrazoRange = { inicio: string | null; fim: string | null } // 'YYYY-MM-DD'

// Dia-calendário de Brasília (YYYY-MM-DD). O "dia" do Prazo Final é o relógio-de-parede
// BRT — robusto p/ navegador em qualquer fuso (não depende do TZ local da máquina).
function ymd(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

/** Estado inicial: 'op' (operacionais) = hoje; 'analytics' = últimos N dias (gráficos não vazios). */
export function defaultPrazoRange(scope: 'op' | 'analytics' = 'op', analyticsDays = 30): PrazoRange {
  const hoje = ymd(new Date())
  if (scope === 'op') return { inicio: hoje, fim: hoje }
  const d = new Date(); d.setDate(d.getDate() - analyticsDays)
  return { inicio: ymd(d), fim: hoje }
}

/** Rótulo curto do intervalo p/ exibir em cards (ex.: "15/06", "01/06–15/06", "Tudo"). */
export function rangeLabel(r: PrazoRange): string {
  const br = (s: string) => s.split('-').reverse().slice(0, 2).join('/')
  if (!r.inicio && !r.fim) return 'Tudo'
  if (r.inicio && r.fim) return r.inicio === r.fim ? br(r.inicio) : `${br(r.inicio)}–${br(r.fim)}`
  return r.inicio ? `desde ${br(r.inicio)}` : `até ${br(r.fim!)}`
}

/** Query params p/ a API (omite nulos). */
export function rangeQuery(r: PrazoRange): { inicio?: string; fim?: string } {
  const q: { inicio?: string; fim?: string } = {}
  if (r.inicio) q.inicio = r.inicio
  if (r.fim) q.fim = r.fim
  return q
}

/**
 * Predicado client-side — replica checkVisibilityDate() do painel e bate com o SQL
 * prazoRangeSql. window_end é relógio-de-parede de Brasília gravado como UTC, então o
 * "dia" do prazo são os componentes UTC do timestamp (slice da ISO) — comparação por
 * string YYYY-MM-DD, independente do fuso do navegador.
 */
export function prazoInRange(prazo: Date | string | null | undefined, r: PrazoRange): boolean {
  if (!r.inicio && !r.fim) return true
  if (!prazo) return false
  const day = new Date(prazo).toISOString().slice(0, 10)
  if (r.inicio && day < r.inicio) return false
  if (r.fim && day > r.fim) return false
  return true
}

const inputCls =
  'h-8 rounded-md border border-border bg-card text-foreground text-xs px-2 outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-primary/40 [color-scheme:dark]'

interface Props {
  value: PrazoRange
  onChange: (v: PrazoRange) => void
  /** rótulo à esquerda (default "Prazo Final") */
  label?: string
  className?: string
}

export function PrazoFinalFilter({ value, onChange, label = 'Prazo Final', className }: Props) {
  const ativo = !!(value.inicio || value.fim)
  return (
    <div className={cn('flex items-center gap-2 flex-wrap shrink-0', className)}>
      <span className="text-xs text-white/70 whitespace-nowrap">{label} de:</span>
      <input
        type="date"
        value={value.inicio ?? ''}
        max={value.fim ?? undefined}
        onChange={(e) => onChange({ ...value, inicio: e.target.value || null })}
        className={inputCls}
      />
      <span className="text-xs text-white/70">até:</span>
      <input
        type="date"
        value={value.fim ?? ''}
        min={value.inicio ?? undefined}
        onChange={(e) => onChange({ ...value, fim: e.target.value || null })}
        className={inputCls}
      />
      <button
        type="button"
        onClick={() => onChange({ inicio: null, fim: null })}
        disabled={!ativo}
        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-xs font-medium bg-card border border-border text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
        title="Limpar filtro de Prazo Final (mostra tudo)"
      >
        <X className="h-3.5 w-3.5" /> Limpar
      </button>
    </div>
  )
}
