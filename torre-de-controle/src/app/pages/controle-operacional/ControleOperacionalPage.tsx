import { useEffect, useMemo, useRef, useState } from 'react'
import { Truck, Volume2, VolumeX, History, ShoppingBag, X, Loader2 } from 'lucide-react'
import { PanelCard } from '@/components/domain/PanelCard'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useOperacionalViagens,
  useMovimentacoes,
  useLhLog,
  useSetOpStatus,
  OP_STATUSES,
  type OpStatus,
  type OpViagem,
} from '@/hooks/useOperacional'

/**
 * Controle Operacional — réplica do painel Shopee (Google Apps Script) na Torre,
 * com a UI do Argon. Os dados vêm SÓ da API SPX (aba "asp"); nada do /api/trips.
 *   • 6 KPIs por status operacional
 *   • Status operacional EDITÁVEL pelo operador (override persistido na Torre)
 *   • "Últimas movimentações" — as alterações de status reais (server-side) + áudio
 *   • Tabela LH/Carregamento/Descarga/Motorista/Origem/Destino/Status(editável)/Log
 *   • Log = histórico de status da viagem · auto-atualização (10s)
 */

const norm = (s?: string | null) => (s ?? '').trim().toUpperCase()

// de-para status operacional → cor (Argon)
function statusTone(s?: string | null): { bg: string; fg: string } {
  const u = norm(s)
  if (u === 'CARREGADO' || u === 'DESCARREGADO') return { bg: 'var(--status-no-prazo-bg)', fg: 'var(--status-no-prazo-fg)' }
  if (u === 'CANCELADO') return { bg: 'var(--status-atrasado-bg)', fg: 'var(--status-atrasado-fg)' }
  if (u.startsWith('CTE')) return { bg: 'rgba(45,118,232,0.15)', fg: '#2d76e8' }
  return { bg: 'var(--status-em-risco-bg)', fg: 'var(--status-em-risco-fg)' } // aguardando / descarregando
}

// AudioContext único e reaproveitado. Navegadores bloqueiam áudio até um gesto do
// usuário (autoplay policy) — por isso unlockAudio() é chamado no 1º clique da página
// e ao ligar o som; beep() faz resume() antes de tocar caso esteja suspenso.
let sharedCtx: AudioContext | null = null
function getCtx(): AudioContext | null {
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!AC) return null
  if (!sharedCtx) {
    try { sharedCtx = new AC() } catch { return null }
  }
  return sharedCtx
}
function unlockAudio() {
  const ctx = getCtx()
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
}
function beep() {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  try {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = 'sine'; o.frequency.value = 880
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    o.start(t); o.stop(t + 0.36)
  } catch { /* contexto ainda suspenso — próximo gesto desbloqueia */ }
}

const KPIS: Array<{ label: string; match: (u: string) => boolean; color: string }> = [
  { label: 'TOTAL DE VIAGENS', match: () => true, color: 'var(--primary)' },
  { label: 'CARREGADO', match: (u) => u === 'CARREGADO', color: '#2dce89' },
  { label: 'CTE EM EMISSÃO', match: (u) => u.includes('CTE') && u.includes('EMISS'), color: '#11cdef' },
  { label: 'CTE ENVIADO', match: (u) => u === 'CTE ENVIADO', color: '#5e72e4' },
  { label: 'AGUARDANDO CARREG.', match: (u) => u === 'AGUARDANDO CARREGAMENTO', color: '#fb6340' },
  { label: 'CANCELADO', match: (u) => u === 'CANCELADO', color: '#f5365c' },
]

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function fmtDur(min: number): string {
  const m = Math.max(0, min)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}min` : `${m % 60}min`
}

function agoLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const min = Math.round(ms / 60000)
  if (min <= 0) return 'agora'
  if (min === 1) return 'há 1 min'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  return h === 1 ? 'há 1 h' : `há ${h} h`
}

export function ControleOperacionalPage() {
  const { data: viagens, isLoading } = useOperacionalViagens({ refetchMs: 10_000 })
  const { data: movs } = useMovimentacoes({ refetchMs: 10_000 })
  const setStatus = useSetOpStatus()

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [soundOn, setSoundOn] = useState(true)
  const [logLh, setLogLh] = useState<string | null>(null)
  const [savingLh, setSavingLh] = useState<string | null>(null)
  const lastTopEvent = useRef<string | null>(null)

  // Desbloqueia o áudio no 1º gesto do usuário (autoplay policy do navegador).
  useEffect(() => {
    const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock) }
    window.addEventListener('pointerdown', unlock)
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  // Áudio quando chega uma movimentação nova (compara a chave do evento mais recente).
  useEffect(() => {
    const top = movs[0]
    if (!top) return
    const key = `${top.lh}|${top.status_operacional}|${top.created_at}`
    if (lastTopEvent.current !== null && lastTopEvent.current !== key && soundOn) beep()
    lastTopEvent.current = key
  }, [movs, soundOn])

  const counts = useMemo(
    () => KPIS.map((k) => viagens.filter((t) => k.match(norm(t.statusOperacional))).length),
    [viagens],
  )

  const statusOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of viagens) if (t.statusOperacional) set.add(t.statusOperacional)
    return [...set].sort()
  }, [viagens])

  const rows = useMemo(
    () => (statusFilter === 'all' ? viagens : viagens.filter((t) => t.statusOperacional === statusFilter)),
    [viagens, statusFilter],
  )

  async function changeStatus(t: OpViagem, status: OpStatus) {
    if (status === t.statusOperacional) return
    setSavingLh(t.lh)
    try {
      await setStatus.mutateAsync({ lh: t.lh, status })
    } finally {
      setSavingLh(null)
    }
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
            <p className="text-xs text-muted-foreground">Direto da SPX (linehaul) · atualiza a cada 10s</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShoppingBag className="h-4 w-4" style={{ color: '#ee4d2d' }} /> Shopee</span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => {
              unlockAudio()
              setSoundOn((v) => {
                const next = !v
                if (next) beep() // confirma que o áudio está funcionando
                return next
              })
            }}
          >
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
          <p className="text-xs text-muted-foreground">Sem movimentações ainda — alterações de status do operador aparecem aqui ao vivo.</p>
        ) : (
          <ul className="space-y-1.5">
            {movs.map((m, i) => (
              <li key={`${m.lh}-${m.created_at}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                <span><strong className="font-mono">{m.lh}</strong>{m.operador && m.operador !== 'SISTEMA' ? ` (${m.operador})` : ''} — <span className="font-semibold text-foreground">{m.status_operacional}</span></span>
                <span className="shrink-0 text-muted-foreground">{agoLabel(m.created_at)}</span>
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
                <th className="px-3 py-2.5 font-medium">Status operacional</th>
                <th className="px-3 py-2.5 text-center font-medium">Log</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const tone = statusTone(t.statusOperacional)
                const saving = savingLh === t.lh
                return (
                  <tr key={t.lh} className="border-b hover:bg-muted/30" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-3 py-2 font-mono">{t.lh}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{t.carregamento || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{t.descarga || '—'}</td>
                    <td className="px-3 py-2 font-medium">{t.motorista || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.origem || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.destino || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Select value={t.statusOperacional} onValueChange={(v) => changeStatus(t, v as OpStatus)} disabled={saving}>
                          <SelectTrigger
                            className="h-7 w-[210px] border-0 text-[11px] font-semibold"
                            style={{ background: tone.bg, color: tone.fg }}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OP_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        {t.overridden && !saving && <span title="Status editado pelo operador" className="text-[9px] text-muted-foreground">✎</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button className="text-muted-foreground hover:text-primary" title="Histórico de status" onClick={() => setLogLh(t.lh)}>
                        <History className="mx-auto h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">{isLoading ? 'Carregando viagens da SPX…' : 'Nenhuma viagem no recorte.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PanelCard>

      {logLh && <LogDialog lh={logLh} onClose={() => setLogLh(null)} />}
    </div>
  )
}

function LogDialog({ lh, onClose }: { lh: string; onClose: () => void }) {
  const { data: log, isLoading } = useLhLog(lh)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-card p-5 shadow-xl" style={{ border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-primary"><History className="h-4 w-4" /> Histórico da Viagem: <span className="font-mono">{lh}</span></h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        ) : log.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem alterações de status registradas para esta viagem ainda.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground" style={{ borderColor: 'var(--border)' }}>
                  <th className="py-2 pr-3 font-medium">De status</th>
                  <th className="py-2 pr-3 font-medium">Para status</th>
                  <th className="py-2 pr-3 font-medium">Duração</th>
                  <th className="py-2 font-medium">Data da mudança</th>
                </tr>
              </thead>
              <tbody>
                {log.map((e, i) => {
                  const prev = log[i + 1] // cronologicamente anterior (log vem desc)
                  const de = prev ? prev.status_operacional : 'Início'
                  const durMin = prev ? Math.round((new Date(e.created_at).getTime() - new Date(prev.created_at).getTime()) / 60000) : null
                  return (
                    <tr key={`${e.created_at}-${i}`} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2 pr-3 text-muted-foreground">{de}</td>
                      <td className="py-2 pr-3 font-semibold" style={{ color: statusTone(e.status_operacional).fg }}>{e.status_operacional}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{durMin != null ? fmtDur(durMin) : '—'}</td>
                      <td className="whitespace-nowrap py-2 text-muted-foreground">{fmtDateTime(e.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
