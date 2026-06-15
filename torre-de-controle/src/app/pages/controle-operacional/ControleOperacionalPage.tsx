import { useEffect, useMemo, useRef, useState } from 'react'
import { Truck, Volume2, VolumeX, History, ShoppingBag } from 'lucide-react'
import { PanelCard } from '@/components/domain/PanelCard'
import { RiskBadge } from '@/components/domain/RiskBadge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TripDetailPanel } from '@/app/pages/viagens/components/TripDetailPanel'
import { useTrips } from '@/hooks/useTrips'
import { formatDate } from '@/lib/formatters'
import type { Trip } from '@/data/types'

/**
 * Controle Operacional — réplica do painel Shopee (Google Apps Script) na Torre,
 * com a UI do Argon. Mesmas informações e funcionalidades:
 *   • 6 KPIs por status operacional (cargasStatus)
 *   • "Últimas movimentações" — detectadas no cliente (diff de status entre polls)
 *   • Tabela LH/Carregamento/Descarga/Motorista/Origem/Destino/Status/GR/Log
 *   • Áudio em nova movimentação (Web Audio, sem asset) + auto-atualização (5s)
 *   • Log = painel completo da viagem (TripDetailPanel, com timeline)
 * Tudo a partir do /api/trips (cliente Shopee) — sem novo backend.
 */

const norm = (s?: string | null) => (s ?? '').trim().toUpperCase()

// de-para status operacional → cor (Argon)
function statusTone(s?: string | null): { bg: string; fg: string } {
  const u = norm(s)
  if (u === 'CARREGADO' || u === 'DESCARREGADO') return { bg: 'var(--status-no-prazo-bg)', fg: 'var(--status-no-prazo-fg)' }
  if (u === 'CANCELADO') return { bg: 'var(--status-atrasado-bg)', fg: 'var(--status-atrasado-fg)' }
  if (u.startsWith('CTE')) return { bg: 'rgba(45,118,232,0.15)', fg: '#2d76e8' }
  // aguardando (carregamento / chegar no cliente)
  return { bg: 'var(--status-em-risco-bg)', fg: 'var(--status-em-risco-fg)' }
}

function beep() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = 'sine'; o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    o.start(); o.stop(ctx.currentTime + 0.36)
    o.onended = () => ctx.close()
  } catch { /* autoplay bloqueado até interação — o toggle resolve */ }
}

interface Movimentacao { id: string; lh: string; motorista: string; status: string; at: number }

const KPIS: Array<{ label: string; match: (u: string) => boolean; color: string }> = [
  { label: 'TOTAL DE VIAGENS', match: () => true, color: 'var(--primary)' },
  { label: 'CARREGADO', match: (u) => u === 'CARREGADO', color: '#2dce89' },
  { label: 'CTE EM EMISSÃO', match: (u) => u.includes('CTE') && u.includes('EMISS'), color: '#11cdef' },
  { label: 'CTE ENVIADO', match: (u) => u === 'CTE ENVIADO', color: '#5e72e4' },
  { label: 'AGUARDANDO CARREG.', match: (u) => u === 'AGUARDANDO CARREGAMENTO', color: '#fb6340' },
  { label: 'CANCELADO', match: (u) => u === 'CANCELADO', color: '#f5365c' },
]

export function ControleOperacionalPage() {
  const { data: allTrips, isLoading } = useTrips({ clientName: 'Shopee', limit: 2000 }, { refetchMs: 5000 })
  // operação corrente: exclui concluídas (DESCARREGADO some da lista, como no painel)
  const trips = useMemo(
    () => allTrips.filter((t) => norm(t.cargasStatus) !== 'DESCARREGADO' && t.status !== 'completed'),
    [allTrips],
  )

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [soundOn, setSoundOn] = useState(true)
  const [movs, setMovs] = useState<Movimentacao[]>([])
  const [logTrip, setLogTrip] = useState<Trip | null>(null)
  const lastStatus = useRef<Map<string, string> | null>(null)

  // Detecta mudanças de status entre polls → "movimentações" + áudio (como o painel).
  useEffect(() => {
    if (!trips.length && lastStatus.current === null) return
    const cur = new Map(trips.map((t) => [t.id, norm(t.cargasStatus)]))
    const prev = lastStatus.current
    if (prev) {
      const novas: Movimentacao[] = []
      for (const t of trips) {
        const before = prev.get(t.id)
        const now = norm(t.cargasStatus)
        if (before !== undefined && before !== now && now) {
          novas.push({ id: `${t.id}-${now}-${Date.now()}`, lh: t.lh || t.code, motorista: t.driverName, status: t.cargasStatus || now, at: Date.now() })
        }
      }
      if (novas.length) {
        setMovs((m) => [...novas, ...m].slice(0, 8))
        if (soundOn) beep()
      }
    }
    lastStatus.current = cur
  }, [trips, soundOn])

  const counts = useMemo(() => KPIS.map((k) => trips.filter((t) => k.match(norm(t.cargasStatus))).length), [trips])

  const statusOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of trips) if (t.cargasStatus) set.add(t.cargasStatus)
    return [...set].sort()
  }, [trips])

  const rows = useMemo(
    () => (statusFilter === 'all' ? trips : trips.filter((t) => t.cargasStatus === statusFilter)),
    [trips, statusFilter],
  )

  const agoLabel = (at: number) => {
    const min = Math.round((Date.now() - at) / 60000)
    return min <= 0 ? 'agora' : min === 1 ? 'há 1 min' : `há ${min} min`
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl bg-card px-5 py-4" style={{ border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2" style={{ background: 'linear-gradient(310deg,#0d2055,#1a4fc4)' }}>
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-primary">Controle Operacional</h1>
            <p className="text-xs text-muted-foreground">Operação Shopee · atualiza a cada 5s</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShoppingBag className="h-4 w-4" style={{ color: '#ee4d2d' }} /> Shopee</span>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setSoundOn((v) => !v)}>
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            {soundOn ? 'Som ligado' : 'Som mudo'}
          </Button>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> {isLoading ? 'Carregando…' : 'Atualizado'}
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((k, i) => (
          <div key={k.label} className="rounded-xl bg-card px-4 py-3" style={{ border: '1px solid var(--border)' }}>
            <div className="text-3xl font-bold tabular-nums" style={{ color: k.color }}>{counts[i]}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Últimas movimentações */}
      <PanelCard title={<span className="text-sm">Últimas movimentações</span>}>
        {movs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aguardando movimentações… (mudanças de status aparecem aqui ao vivo)</p>
        ) : (
          <ul className="space-y-1.5">
            {movs.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                <span><strong className="font-mono">{m.lh}</strong> ({m.motorista}) — <span className="font-semibold text-foreground">{m.status}</span></span>
                <span className="shrink-0 text-muted-foreground">{agoLabel(m.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      {/* Tabela */}
      <PanelCard
        title={<span className="flex items-center gap-2 text-sm"><Truck className="h-4 w-4 text-primary" /> Detalhes das Viagens</span>}
        subtitle={`${rows.length} viagem(ns)`}
        action={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Filtrar status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        }
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground" style={{ borderColor: 'var(--border)' }}>
                <th className="px-3 py-2.5 font-medium">LH</th>
                <th className="px-3 py-2.5 font-medium">Carregamento</th>
                <th className="px-3 py-2.5 font-medium">Descarga</th>
                <th className="px-3 py-2.5 font-medium">Motorista</th>
                <th className="px-3 py-2.5 font-medium">Origem</th>
                <th className="px-3 py-2.5 font-medium">Destino</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-center font-medium">GR</th>
                <th className="px-3 py-2.5 text-center font-medium">Log</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const tone = statusTone(t.cargasStatus)
                return (
                  <tr key={t.id} className="border-b hover:bg-muted/30" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-3 py-2 font-mono">{t.lh || t.code}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{t.windowStart ? formatDate(t.windowStart, 'dd/MM/yyyy HH:mm') : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{t.windowEnd ? formatDate(t.windowEnd, 'dd/MM/yyyy HH:mm') : '—'}</td>
                    <td className="px-3 py-2 font-medium">{t.driverName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.origin}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.destination}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>
                        {t.cargasStatus || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center"><RiskBadge level={t.riskLevel} score={t.riskScore} size="sm" /></td>
                    <td className="px-3 py-2 text-center">
                      <button className="text-muted-foreground hover:text-primary" title="Histórico da viagem" onClick={() => setLogTrip(t)}>
                        <History className="mx-auto h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Nenhuma viagem no recorte.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PanelCard>

      {logTrip && <TripDetailPanel trip={logTrip} onClose={() => setLogTrip(null)} />}
    </div>
  )
}
