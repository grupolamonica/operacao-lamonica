/**
 * GR — Gerenciamento de Risco (PR4). Monitoramento de vigências (Angellira/BRK/
 * SPX) por motorista/veículo + feed de alertas + cofre de credenciais do
 * rastreador. Consome /api/gr/* (PR1–PR3); dados vêm do Cargas via gr.sync.
 */
import { useMemo, useState } from 'react'
import {
  ShieldAlert, Users, Truck, AlertTriangle, RefreshCw,
  Eye, EyeOff, Pencil, Trash2, Plus, X,
} from 'lucide-react'
import { KPICard } from '@/components/domain/KPICard'
import { useAuthStore } from '@/stores/useAuthStore'
import { formatRelative } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import {
  useGROverview, useGRDrivers, useGRVehicles, useGRAlerts, useGRVault,
  useGRSync, useVaultUpsert, useVaultReveal, useVaultDelete,
  type GrVerdict, type GrProviderStatus, type GrDriver, type GrVehicle,
  type VaultItem, type VaultUpsertInput,
} from '@/hooks/useGR'

// ── Metadados visuais (hex Argon, mesmo vocabulário das outras telas) ─────────
const VERDICT: Record<GrVerdict, { label: string; color: string }> = {
  OK:       { label: 'OK',        color: '#2dce89' },
  ATENCAO:  { label: 'Atenção',   color: '#fb6340' },
  CRITICO:  { label: 'Crítico',   color: '#f5365c' },
  SEM_DADO: { label: 'Sem dado',  color: '#8392ab' },
}

const PLATE_ROLE: Record<string, string> = { HORSE: 'Cavalo', TRAILER_1: 'Carreta', TRAILER_2: '2ª carreta' }

type Tab = 'motoristas' | 'veiculos' | 'alertas' | 'credenciais'

/** 'YYYY-MM-DD...' → 'DD/MM/YYYY' (sem passar por Date/fuso). */
function fmtDay(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function Chip({ label, color, title, pulse }: { label: string; color: string; title?: string; pulse?: boolean }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap',
        pulse && 'animate-pulse',
      )}
      style={{ background: `${color}22`, color, ...(pulse ? { boxShadow: `0 0 0 1px ${color}` } : null) }}
    >
      {label}
    </span>
  )
}

/** "não localizado na base Angellira" — estado que o painel destaca/pulsa.
 *  Normaliza igual ao backend (isAngelliraNotFound: trim/lower/sem acento) p/
 *  não divergir se o Cargas gravar "não_encontrado" com acento no rawStatus. */
function isNotFound(p: GrProviderStatus | null | undefined): boolean {
  const s = (p?.rawStatus ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return s === 'not_found' || s === 'nao_encontrado' || s === 'nao encontrado'
}

/** Chip de um provider a partir do status materializado (gr_vigencias). */
function ProviderChip({ p }: { p: GrProviderStatus | null | undefined }) {
  if (!p) return <Chip label="sem dado" color="#8392ab" />
  if (p.status === 'EXPIRED') {
    return <Chip label={`Vencido${p.validUntil ? ` ${fmtDay(p.validUntil)}` : ''}`} color="#f5365c" title={p.statusText ?? undefined} />
  }
  if (p.status === 'EXPIRING_SOON') {
    return <Chip label={`Vence em ${p.daysUntilExpiry ?? '?'}d`} color="#fb6340" title={p.validUntil ? fmtDay(p.validUntil) : undefined} />
  }
  if (p.status === 'OK') {
    return <Chip label={`Vigente${p.validUntil ? ` até ${fmtDay(p.validUntil)}` : ''}`} color="#2dce89" title={p.statusText ?? undefined} />
  }
  if (p.provider === 'brk' && p.conjuntoApto === false) {
    return <Chip label="Reprovado" color="#f5365c" title={p.statusText ?? undefined} />
  }
  if (isNotFound(p)) {
    return <Chip label="Não localizado" color="#f5365c" pulse title="Não localizado na base Angellira" />
  }
  if ((p.rawStatus ?? '').trim().toLowerCase() === 'found') {
    return <Chip label="Na base" color="#8392ab" title="Na base Angellira, sem data de vigência" />
  }
  return <Chip label={p.statusText ?? p.rawStatus ?? 'situacional'} color="#5e72e4" />
}

const thCls = 'px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground'
const tdCls = 'px-3 py-2 text-sm text-foreground align-middle'
const inputCls =
  'h-8 rounded-md border border-border bg-card text-foreground text-xs px-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

export function GRPage() {
  const role = useAuthStore((s) => s.user?.role)
  const canManage = role === 'admin' || role === 'supervisor' // Sincronizar
  // Cofre: operadores do GR (analistas) + supervisão + admin veem, preenchem e
  // revelam (auditado). Excluir (destrutivo) fica só com supervisão + admin.
  const canVault = canManage || role === 'analyst'
  const canDeleteVault = canManage

  const [tab, setTab] = useState<Tab>('alertas')
  const [search, setSearch] = useState('')

  const overview = useGROverview()
  const drivers = useGRDrivers()
  const vehicles = useGRVehicles()
  const alerts = useGRAlerts()
  const vault = useGRVault(canVault && tab === 'credenciais')
  const syncMut = useGRSync()

  const tabs: Array<{ key: Tab; label: string; count: number; hidden?: boolean }> = [
    { key: 'alertas', label: 'Alertas', count: alerts.data.length },
    { key: 'motoristas', label: 'Motoristas', count: overview.data.drivers.total },
    { key: 'veiculos', label: 'Veículos', count: overview.data.vehicles.total },
    { key: 'credenciais', label: 'Credenciais', count: vault.data.length, hidden: !canVault },
  ]

  const q = search.trim().toUpperCase()
  const filteredDrivers = useMemo(() => {
    const rank: Record<GrVerdict, number> = { CRITICO: 0, ATENCAO: 1, OK: 2, SEM_DADO: 3 }
    return drivers.data
      .filter((d) => !q || (d.displayName ?? '').toUpperCase().includes(q) || d.cpf.includes(q.replace(/\D/g, '')))
      .sort((a, b) => rank[a.verdict] - rank[b.verdict] || (a.displayName ?? '').localeCompare(b.displayName ?? ''))
  }, [drivers.data, q])
  const filteredVehicles = useMemo(() => {
    const rank: Record<GrVerdict, number> = { CRITICO: 0, ATENCAO: 1, OK: 2, SEM_DADO: 3 }
    return vehicles.data
      .filter((v) => !q || v.plate.includes(q.replace(/[^A-Z0-9]/g, '')) || (v.displayName ?? '').toUpperCase().includes(q))
      .sort((a, b) => rank[a.verdict] - rank[b.verdict] || a.plate.localeCompare(b.plate))
  }, [vehicles.data, q])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" /> Gerenciamento de Risco
          </h1>
          <p className="text-xs text-white/70 mt-0.5">
            Vigências Angellira / BRK / SPX por motorista e veículo · dados do Cargas
            {overview.data.lastSyncAt ? ` · sync ${formatRelative(overview.data.lastSyncAt)}` : ''}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="inline-flex items-center gap-2 h-8 rounded-md bg-card border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', syncMut.isPending && 'animate-spin')} />
            {syncMut.isPending ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
        <KPICard title="Motoristas monitorados" value={overview.data.drivers.total} subtitle={`${overview.data.drivers.critico} críticos · ${overview.data.drivers.atencao} em atenção`} color="blue" icon={Users} />
        <KPICard title="Veículos monitorados" value={overview.data.vehicles.total} subtitle={`${overview.data.vehicles.critico} críticos · ${overview.data.vehicles.atencao} em atenção`} color="purple" icon={Truck} />
        <KPICard title="Alertas críticos" value={overview.data.alertas.criticos} color="red" icon={AlertTriangle} />
        <KPICard title="Em atenção" value={overview.data.alertas.atencao} color="orange" icon={AlertTriangle} />
      </div>

      {/* Tabs + busca */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {tabs.filter((t) => !t.hidden).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'h-7 rounded-full px-3 text-xs font-semibold transition-colors',
                tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label} <span className="tabular-nums opacity-70">({t.count})</span>
            </button>
          ))}
        </div>
        {(tab === 'motoristas' || tab === 'veiculos') && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'motoristas' ? 'Buscar nome ou CPF…' : 'Buscar placa…'}
            className={cn(inputCls, 'w-56')}
          />
        )}
      </div>

      {tab === 'alertas' && <AlertsTab alerts={alerts.data} isLoading={alerts.isLoading} />}
      {tab === 'motoristas' && <DriversTab drivers={filteredDrivers} isLoading={drivers.isLoading} />}
      {tab === 'veiculos' && <VehiclesTab vehicles={filteredVehicles} isLoading={vehicles.isLoading} />}
      {tab === 'credenciais' && canVault && <VaultTab items={vault.data} isLoading={vault.isLoading} canWrite={canVault} canDelete={canDeleteVault} />}
    </div>
  )
}

// ── Aba Alertas ───────────────────────────────────────────────────────────────
function AlertsTab({ alerts, isLoading }: { alerts: ReturnType<typeof useGRAlerts>['data']; isLoading: boolean }) {
  if (isLoading) return <Empty text="Carregando alertas…" />
  if (alerts.length === 0) return <Empty text="Nenhum alerta de risco no momento. 🎉" />
  return (
    <div className="bg-card border border-border rounded-lg divide-y divide-border">
      {alerts.map((a) => {
        const notFound = a.alertType === 'NOT_FOUND'
        const sev = a.severity === 'crit' ? '#f5365c' : '#fb6340'
        return (
          <div
            key={a.id}
            className="flex items-center gap-3 p-3"
            style={notFound ? { background: 'rgba(245,54,92,0.06)' } : undefined}
          >
            <span
              className={cn('w-1 self-stretch rounded-full shrink-0', notFound && 'animate-pulse')}
              style={{ background: sev }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">{a.message}</p>
              <p className="text-xs text-muted-foreground truncate">
                {a.entityType === 'motorista'
                  ? `${a.displayName ?? '—'}${a.document ? ` · CPF ${a.document}` : ''}`
                  : `${a.plate ?? '—'}${a.plateRole ? ` · ${PLATE_ROLE[a.plateRole] ?? a.plateRole}` : ''}${a.linkedDriver?.name ? ` · ${a.linkedDriver.name}` : ''}`}
                {a.dueDate ? ` · vence ${fmtDay(a.dueDate)}` : ''}
              </p>
            </div>
            <Chip label={a.source} color="#5e72e4" />
            {notFound
              ? <Chip label="NÃO LOCALIZADO" color="#f5365c" pulse title="Não localizado na base Angellira" />
              : <Chip label={a.severity === 'crit' ? 'Crítico' : 'Atenção'} color={sev} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Aba Motoristas ────────────────────────────────────────────────────────────
function DriversTab({ drivers, isLoading }: { drivers: GrDriver[]; isLoading: boolean }) {
  if (isLoading) return <Empty text="Carregando motoristas…" />
  if (drivers.length === 0) return <Empty text="Nenhum motorista no cache do GR — rode o Sincronizar." />
  const byProvider = (d: GrDriver, key: GrProviderStatus['provider']) => d.providers.find((p) => p.provider === key)
  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-border">
          <tr>
            <th className={thCls}>Motorista</th>
            <th className={thCls}>Veredito</th>
            <th className={thCls}>Angellira</th>
            <th className={thCls}>BRK</th>
            <th className={thCls}>SPX</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {drivers.map((d) => (
            <tr key={d.cpf}>
              <td className={tdCls}>
                <p className="font-semibold">{d.displayName ?? '—'}</p>
                <p className="text-xs text-muted-foreground tabular-nums">{d.cpf}</p>
              </td>
              <td className={tdCls}><Chip label={VERDICT[d.verdict].label} color={VERDICT[d.verdict].color} /></td>
              <td className={tdCls}><ProviderChip p={byProvider(d, 'angellira')} /></td>
              <td className={tdCls}><ProviderChip p={byProvider(d, 'brk')} /></td>
              <td className={tdCls}><ProviderChip p={byProvider(d, 'spx')} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Aba Veículos ──────────────────────────────────────────────────────────────
function VehiclesTab({ vehicles, isLoading }: { vehicles: GrVehicle[]; isLoading: boolean }) {
  if (isLoading) return <Empty text="Carregando veículos…" />
  if (vehicles.length === 0) return <Empty text="Nenhum veículo no cache do GR — rode o Sincronizar." />
  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-border">
          <tr>
            <th className={thCls}>Placa</th>
            <th className={thCls}>Papel</th>
            <th className={thCls}>Motorista vinculado</th>
            <th className={thCls}>Veredito</th>
            <th className={thCls}>Angellira</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {vehicles.map((v) => (
            <tr key={v.plate}>
              <td className={cn(tdCls, 'font-mono font-semibold')}>{v.plate}</td>
              <td className={tdCls}>{v.plateRole ? PLATE_ROLE[v.plateRole] ?? v.plateRole : '—'}</td>
              <td className={tdCls}>
                <p className="text-sm">{v.displayName ?? '—'}</p>
                {v.linkedDriverCpf && <p className="text-xs text-muted-foreground tabular-nums">{v.linkedDriverCpf}</p>}
              </td>
              <td className={tdCls}><Chip label={VERDICT[v.verdict].label} color={VERDICT[v.verdict].color} /></td>
              <td className={tdCls}><ProviderChip p={v.angellira} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Aba Credenciais (cofre) ───────────────────────────────────────────────────
function VaultTab({ items, isLoading, canWrite, canDelete }: { items: VaultItem[]; isLoading: boolean; canWrite: boolean; canDelete: boolean }) {
  const upsertMut = useVaultUpsert()
  const revealMut = useVaultReveal()
  const deleteMut = useVaultDelete()
  // Senhas reveladas: SÓ estado local desta aba (nunca cache/persistência).
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [form, setForm] = useState<VaultUpsertInput | null>(null)

  async function toggleReveal(plate: string) {
    if (revealed[plate] !== undefined) {
      setRevealed((r) => { const n = { ...r }; delete n[plate]; return n })
      return
    }
    const res = await revealMut.mutateAsync(plate)
    setRevealed((r) => ({ ...r, [plate]: res.senha ?? '' }))
  }

  async function save() {
    if (!form?.plate) return
    await upsertMut.mutateAsync(form)
    setForm(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5" />
          Senhas cifradas em repouso; cada “Revelar” fica registrado na trilha de auditoria.
        </p>
        {canWrite && !form && (
          <button
            onClick={() => setForm({ plate: '' })}
            className="inline-flex items-center gap-1.5 h-8 rounded-md bg-card border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> Nova credencial
          </button>
        )}
      </div>

      {form && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{items.some((i) => i.plate === form.plate) ? `Editar ${form.plate}` : 'Nova credencial'}</p>
            <button onClick={() => setForm(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <input className={inputCls} placeholder="Placa do cavalo *" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} />
            <input className={inputCls} placeholder="Rastreadora (Omnilink…)" value={form.provider ?? ''} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
            <input className={inputCls} placeholder="Login" value={form.login ?? ''} onChange={(e) => setForm({ ...form, login: e.target.value })} />
            <input className={inputCls} placeholder="Usuário" value={form.username ?? ''} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input className={inputCls} type="password" placeholder="Senha (vazio = mantém)" value={form.senha ?? ''} onChange={(e) => setForm({ ...form, senha: e.target.value })} autoComplete="new-password" />
            <input className={inputCls} placeholder="ID/MCT" value={form.rastreadorId ?? ''} onChange={(e) => setForm({ ...form, rastreadorId: e.target.value })} />
            <input className={inputCls} placeholder="Embarcador" value={form.embarcador ?? ''} onChange={(e) => setForm({ ...form, embarcador: e.target.value })} />
            <input className={inputCls} placeholder="Observações" value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button
            onClick={save}
            disabled={upsertMut.isPending || !form.plate}
            className="h-8 rounded-md bg-primary text-primary-foreground px-4 text-xs font-semibold disabled:opacity-60"
          >
            {upsertMut.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      )}

      {isLoading ? (
        <Empty text="Carregando credenciais…" />
      ) : items.length === 0 ? (
        <Empty text="Cofre vazio — cadastre as credenciais dos rastreadores (hoje na aba BaseRatreador da planilha)." />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className={thCls}>Placa</th>
                <th className={thCls}>Rastreadora</th>
                <th className={thCls}>Login</th>
                <th className={thCls}>Usuário</th>
                <th className={thCls}>Senha</th>
                <th className={thCls}>ID/MCT</th>
                <th className={thCls}>Embarcador</th>
                {canWrite && <th className={thCls}></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it) => (
                <tr key={it.plate}>
                  <td className={cn(tdCls, 'font-mono font-semibold')}>{it.plate}</td>
                  <td className={tdCls}>{it.provider || '—'}</td>
                  <td className={cn(tdCls, 'font-mono text-xs')}>{it.login || '—'}</td>
                  <td className={cn(tdCls, 'font-mono text-xs')}>{it.username || '—'}</td>
                  <td className={tdCls}>
                    <span className="inline-flex items-center gap-2">
                      <span className="font-mono text-xs tabular-nums">
                        {revealed[it.plate] !== undefined ? revealed[it.plate] || '(vazia)' : it.hasPassword ? '••••••••' : '—'}
                      </span>
                      {canWrite && it.hasPassword && (
                        <button
                          onClick={() => toggleReveal(it.plate)}
                          disabled={revealMut.isPending}
                          title={revealed[it.plate] !== undefined ? 'Ocultar' : 'Revelar (registra na auditoria)'}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          {revealed[it.plate] !== undefined ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </span>
                  </td>
                  <td className={cn(tdCls, 'text-xs')}>{it.rastreadorId || '—'}</td>
                  <td className={cn(tdCls, 'text-xs')}>{it.embarcador || '—'}</td>
                  {canWrite && (
                    <td className={cn(tdCls, 'text-right whitespace-nowrap')}>
                      <button
                        onClick={() => setForm({
                          plate: it.plate, provider: it.provider, login: it.login, username: it.username,
                          rastreadorId: it.rastreadorId ?? '', embarcador: it.embarcador ?? '', notes: it.notes ?? '',
                        })}
                        title="Editar"
                        className="text-muted-foreground hover:text-foreground mr-2"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => { if (window.confirm(`Remover a credencial de ${it.plate}?`)) deleteMut.mutate(it.plate) }}
                          title="Excluir"
                          className="text-muted-foreground hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="bg-card border border-border rounded-lg py-12 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}
