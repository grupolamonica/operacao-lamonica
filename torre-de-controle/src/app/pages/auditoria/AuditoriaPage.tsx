import { useMemo, useState } from 'react'
import { StickyNote, ClipboardCheck, Phone, Activity, ShieldAlert, Users as UsersIcon } from 'lucide-react'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { PrazoFinalFilter, defaultPrazoRange, rangeQuery, type PrazoRange } from '@/components/domain/PrazoFinalFilter'
import { useUsers } from '@/hooks/useUsers'
import { useAuditLog, type AuditCategory, type AuditItem } from '@/hooks/useAuditLog'
import { useAuthStore } from '@/stores/useAuthStore'
import { formatDate } from '@/lib/formatters'
import { cn } from '@/lib/utils'

// Categoria → rótulo, cor (hex Argon) e ícone. Cor pinta o chip e o ícone do item.
const CATEGORY: Record<AuditCategory, { label: string; color: string; icon: typeof StickyNote }> = {
  nota:               { label: 'Nota',       color: '#5e72e4', icon: StickyNote },
  tratativa:          { label: 'Tratativa',  color: '#825ee4', icon: ClipboardCheck },
  comunicacao:        { label: 'Comunicação', color: '#2dce89', icon: Phone },
  status_operacional: { label: 'Status',     color: '#fb6340', icon: Activity },
}

const FILTERS: Array<{ key: AuditCategory | 'todos'; label: string }> = [
  { key: 'todos', label: 'Tudo' },
  { key: 'nota', label: 'Notas' },
  { key: 'tratativa', label: 'Tratativas' },
  { key: 'comunicacao', label: 'Comunicações' },
  { key: 'status_operacional', label: 'Status operacional' },
]

// Dia-calendário de Brasília (YYYY-MM-DD) p/ agrupar — independente do fuso do navegador.
function brDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}
function dayLabel(day: string): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const y = new Date(); y.setDate(y.getDate() - 1)
  const yest = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(y)
  if (day === today) return 'Hoje'
  if (day === yest) return 'Ontem'
  return day.split('-').reverse().join('/')
}

export function AuditoriaPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const [range, setRange] = useState<PrazoRange>(() => defaultPrazoRange('analytics', 7))
  const [operatorId, setOperatorId] = useState<string>('')
  const [category, setCategory] = useState<AuditCategory | 'todos'>('todos')

  const { data: users } = useUsers()
  const operators = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  )

  const filters = useMemo(
    () => ({
      ...rangeQuery(range),
      ...(operatorId ? { operatorId } : {}),
      ...(category !== 'todos' ? { category } : {}),
    }),
    [range, operatorId, category],
  )
  const { data: items, isLoading } = useAuditLog(isAdmin ? filters : undefined)

  // Resumo + agrupamento por dia (mais recente primeiro; o backend já ordena desc).
  const distinctOps = useMemo(() => new Set(items.map((i) => i.operatorName)).size, [items])
  const groups = useMemo(() => {
    const map = new Map<string, AuditItem[]>()
    for (const it of items) {
      const d = brDay(it.occurredAt)
      const g = map.get(d)
      if (g) g.push(it); else map.set(d, [it])
    }
    return [...map.entries()] // já em ordem de inserção = desc
  }, [items])

  if (!isAdmin) {
    return (
      <div className="space-y-5">
        <Header />
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20">
          <span className="flex items-center justify-center h-14 w-14 rounded-full bg-muted">
            <ShieldAlert className="h-7 w-7 text-muted-foreground" />
          </span>
          <p className="text-base font-semibold text-foreground">Acesso restrito</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            A auditoria de operadores é exclusiva para administradores.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Header />

      {/* Filtros */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            className="h-8 rounded-md border border-border bg-card text-foreground text-xs px-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title="Filtrar por operador"
          >
            <option value="">Todos os operadores</option>
            {operators.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <PrazoFinalFilter label="Período" value={range} onChange={setRange} />
      </div>

      {/* Chips de categoria */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setCategory(f.key)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              category === f.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-foreground border-border hover:bg-accent',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Resumo */}
      <div className="flex items-center gap-4 text-xs text-white/70">
        <span className="inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> {items.length} ações</span>
        <span className="inline-flex items-center gap-1.5"><UsersIcon className="h-3.5 w-3.5" /> {distinctOps} operador{distinctOps === 1 ? '' : 'es'}</span>
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="text-sm text-white/60 py-12 text-center">Carregando atividades…</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-2 py-20">
          <span className="flex items-center justify-center h-12 w-12 rounded-full bg-muted">
            <Activity className="h-6 w-6 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium text-foreground">Nenhuma ação no período</p>
          <p className="text-xs text-muted-foreground">Ajuste o período ou o operador para ver mais.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([day, list]) => (
            <div key={day} className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-white/60">{dayLabel(day)}</h2>
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] text-white/40">{list.length}</span>
              </div>
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {list.map((it) => <Row key={it.id} item={it} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Header() {
  return (
    <header className="pb-1">
      <h1 className="text-2xl font-bold text-white">Auditoria</h1>
      <p className="text-sm text-white/70">Tudo que os operadores fizeram — filtre por período e operador.</p>
    </header>
  )
}

function Row({ item }: { item: AuditItem }) {
  const meta = CATEGORY[item.category]
  const Icon = meta.icon
  return (
    <div className="flex items-start gap-3 p-3">
      <DriverAvatar name={item.operatorName} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{item.operatorName}</span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: `${meta.color}22`, color: meta.color }}
          >
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums shrink-0" title={formatDate(item.occurredAt, 'dd/MM/yyyy HH:mm:ss')}>
            {formatDate(item.occurredAt, 'dd/MM HH:mm')}
          </span>
        </div>
        <p className="text-sm text-foreground mt-0.5">
          {item.action}
          {item.target && <span className="text-muted-foreground"> · {item.target}</span>}
        </p>
        {item.detail && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">{item.detail}</p>
        )}
      </div>
    </div>
  )
}
