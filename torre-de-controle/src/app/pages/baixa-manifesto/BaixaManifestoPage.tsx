import { useEffect, useMemo, useRef, useState } from 'react'
import { PackageCheck, Phone, Volume2, VolumeX } from 'lucide-react'
import { PanelCard } from '@/components/domain/PanelCard'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { FixedPanel } from '@/components/domain/FixedPanel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useManifestoPendencias, type EstadoManifesto, type PendenciaManifesto, type Telefone } from '@/hooks/useManifestoPendencias'
import { useNow } from '@/hooks/useNow'
import { formatDuration } from '@/lib/formatters'
import { unlockAudio, beep, speak, primeSpeech } from '@/lib/audioAlert'

/**
 * Baixa de Manifesto — v2 (11/08, ver V2-CONTRATO.md).
 *
 * Universo passa de "4 pendências de baixa" para TODO manifesto aberto (~85):
 * a SM da Angellira é o sinal principal do `estado`, Sascar/macro é reforço e
 * plano B. O coletor_v2.py roda em paralelo ao coletor.py (v1) até o Danilo
 * aprovar a troca da task — por isso esta tela precisa renderizar os dois
 * formatos sem quebrar (ver deriveEstado/estagio abaixo).
 *
 *   • KPIs por estado + "prazo vencido"
 *   • Filtro rápido por estado + toggle "só prazo vencido" (85 itens é demais
 *     para rolar sem filtro)
 *   • Tabela ordenada pelo contrato: descarregado (maior atraso) → descarregando
 *     → aguardando_descarga → em_transito com prazo vencido → resto por horas_aberto
 *   • Som (reusa src/lib/audioAlert.ts): SÓ quando um manifesto ENTRA em
 *     `descarregado` — demais transições silenciosas (85 itens, som só no que
 *     exige ação)
 */

const ESTADOS: { key: EstadoManifesto; emoji: string; label: string; bg: string; fg: string }[] = [
  { key: 'descarregado', emoji: '🔴', label: 'Descarregado', bg: 'var(--status-atrasado-bg)', fg: 'var(--status-atrasado-fg)' },
  { key: 'descarregando', emoji: '🟠', label: 'Descarregando', bg: 'var(--status-em-risco-bg)', fg: 'var(--status-em-risco-fg)' },
  // sem token CSS pronto para amarelo (--status-* só tem verde/laranja/vermelho/cinza) — inline aqui mesmo
  { key: 'aguardando_descarga', emoji: '🟡', label: 'Aguardando descarga', bg: 'oklch(0.870 0.165 95.0 / 0.20)', fg: 'oklch(0.450 0.130 95.0)' },
  { key: 'em_transito', emoji: '🚚', label: 'Em trânsito', bg: 'rgba(26,79,196,0.12)', fg: 'var(--primary)' },
  { key: 'sem_rastreio', emoji: '❓', label: 'Sem rastreio', bg: 'var(--status-sem-sinal-bg)', fg: 'var(--status-sem-sinal-fg)' },
]
const ESTADO_INFO = Object.fromEntries(ESTADOS.map((e) => [e.key, e])) as Record<EstadoManifesto, typeof ESTADOS[number]>

const ORIGEM_LABEL: Record<'sm' | 'sascar' | 'macro', string> = { sm: 'SM', sascar: 'GPS', macro: 'MACRO' }

// v1 não manda `estado` — deriva do `estagio` antigo (compatibilidade, ver TAREFA 2).
function deriveEstado(p: PendenciaManifesto): EstadoManifesto {
  if (p.estado) return p.estado
  if (p.estagio === 'descarregado') return 'descarregado'
  if (p.estagio === 'descarregando') return 'descarregando'
  return 'sem_rastreio'
}

function vencido(p: PendenciaManifesto): boolean {
  return (p.horas_atraso ?? 0) > 0
}

// *_local é literal "wall-clock" (já em horário local) — nunca reinterpretar via
// `new Date(str)` (o fuso do navegador pode não bater com o do servidor). Extrai
// os componentes por regex e reformata dd/MM/yyyy HH:mm sem tocar no relógio.
function fmtLocal(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return iso
  const [, y, mo, d, h, mi] = m
  return `${d}/${mo}/${y} ${h}:${mi}`
}

// Tempo decorrido (compat v1) é calculado por *_gmt (UTC, sem sufixo 'Z' no
// payload) — anexa o 'Z' antes de criar o Date para não reinterpretar como
// horário local do navegador.
function parseGmt(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(`${iso}Z`)
  return isNaN(d.getTime()) ? null : d
}

function elapsedMinutesV1(p: PendenciaManifesto, now: Date): number | null {
  const base = parseGmt(p.fim_gmt) ?? parseGmt(p.chegada_gmt)
  if (!base) return null
  return Math.max(0, Math.round((now.getTime() - base.getTime()) / 60_000))
}

// "Aberto há" — v2 manda horas_aberto pronto; v1 não tem o campo, aproxima a
// partir de chegada/fim (mesma conta que a tela v1 já fazia).
function horasAbertoDe(p: PendenciaManifesto, now: Date): number | null {
  if (p.horas_aberto != null) return p.horas_aberto
  const min = elapsedMinutesV1(p, now)
  return min == null ? null : min / 60
}

// quando_local (Sascar) é literal wall-clock — constrói o Date a partir dos
// MESMOS componentes no relógio local do navegador (sem `new Date(str)` direto,
// que reinterpretaria pelo fuso do navegador) para poder subtrair de `now`.
function minutesSinceLocal(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const base = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? '0'))
  return Math.max(0, Math.round((now.getTime() - base.getTime()) / 60_000))
}

// Rótulo do manifesto: v2 é um único codman+filial; v1 tem uma lista `manifestos[]`.
function manifestoLabel(p: PendenciaManifesto): string {
  if (p.codman != null) return String(p.codman)
  if (p.manifestos?.length) return p.manifestos.map((m) => m.codman).join(', ')
  return '—'
}

// Chave estável do manifesto (independe do estado) — usada para detectar
// transição de estado (chave = `${chaveManifesto(p)}|${estado}`).
function chaveManifesto(p: PendenciaManifesto): string {
  if (p.codman != null) return `codman:${p.codman}|${p.filial ?? ''}|${p.serie ?? ''}`
  if (p.codlpr != null) return `codlpr:${p.codlpr}`
  return `placa:${p.placa ?? ''}`
}

// Cavalo (v2) com fallback pra placa (v1) — mesma coisa, nome de campo mudou.
function cavaloDe(p: PendenciaManifesto): string {
  return p.cavalo || p.placa || '—'
}
function carretaDe(p: PendenciaManifesto): string {
  return p.carreta || p.viagem?.carreta || '—'
}

// Km até o destino: km_faltante da SM é a fonte mais confiável (Angellira);
// km_destino da última posição Sascar é o plano B.
function kmDestinoDe(p: PendenciaManifesto): number | null {
  return p.sm?.km_faltante ?? p.posicao?.km_destino ?? null
}
function fmtKm(km: number | null): string {
  return km == null ? '—' : `${km.toFixed(1)} km`
}

// Distância Sascar (ponto de referência, v1) chega em metros.
function fmtDistancia(m: number | null | undefined): string {
  if (m == null) return '—'
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m)} m`
}

// Contatos de uma pendência: v2 manda `motorista_fones` no topo (um motorista);
// v1 manda dentro de `viagem` (até dois motoristas). Unifica os dois formatos.
function contatosDaPendencia(p: PendenciaManifesto): { nome: string; fones: Telefone[] }[] {
  if (p.motorista_fones?.length) {
    return [{ nome: p.motorista || '—', fones: p.motorista_fones }]
  }
  const legado = (fone?: string) => (fone ? [{ rotulo: 'Telefone', numero: fone }] : [])
  return [
    { nome: p.motorista ?? '', fones: p.viagem?.motorista_fones ?? legado(p.viagem?.motorista_fone) },
    { nome: p.viagem?.motorista2 ?? '', fones: p.viagem?.motorista2_fones ?? legado(p.viagem?.motorista2_fone) },
  ].filter((c) => c.nome && c.fones.length > 0)
}

// Dois beeps em sequência (🔴 entrou em descarregado) — aguarda o 1º terminar antes do 2º.
async function beepUrgente() {
  await beep(1175)
  await new Promise((r) => setTimeout(r, 150))
  await beep(1175)
}

// Ordenação do contrato (V2-CONTRATO.md): descarregado (maior atraso primeiro)
// → descarregando → aguardando_descarga → em_transito com prazo vencido →
// resto por horas_aberto (usado também como critério de desempate dos grupos acima).
function rankEstado(p: PendenciaManifesto): number {
  const estado = deriveEstado(p)
  if (estado === 'descarregado') return 0
  if (estado === 'descarregando') return 1
  if (estado === 'aguardando_descarga') return 2
  if (estado === 'em_transito' && vencido(p)) return 3
  return 4
}

export function BaixaManifestoPage() {
  const { data: snapshot, pendencias, isLoading } = useManifestoPendencias()
  const now = useNow(30_000)
  const [soundOn, setSoundOn] = useState(true)
  const seenKeys = useRef<Set<string> | null>(null)
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoManifesto | 'todos'>('todos')
  const [soVencido, setSoVencido] = useState(false)
  // Painel de detalhes: guarda só a chave, não o objeto — a cada render re-deriva
  // do array (fresco a cada polling de 30s); some sozinho da lista (baixada) = painel fecha.
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = pendencias.find((p) => chaveManifesto(p) === selectedKey) ?? null
  // modal de contatos (ícone 📞 da tabela) — mesmo padrão: guarda a chave e re-deriva
  const [contatosDe, setContatosDe] = useState<string | null>(null)
  const pendenciaContatos = pendencias.find((p) => chaveManifesto(p) === contatosDe) ?? null

  // Desbloqueia áudio + voz no 1º gesto do usuário (autoplay policy do navegador).
  useEffect(() => {
    const unlock = () => { unlockAudio(); primeSpeech(); window.removeEventListener('pointerdown', unlock) }
    window.addEventListener('pointerdown', unlock)
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  // Som SÓ quando um manifesto ENTRA em `descarregado` (chave = manifesto|estado,
  // então virar de estado também é detectado como "nova chave"). Demais
  // transições silenciosas — com ~85 itens, som só no que exige ação (baixar).
  useEffect(() => {
    if (!pendencias.length) return
    const estados = pendencias.map(deriveEstado)
    const keys = pendencias.map((p, i) => `${chaveManifesto(p)}|${estados[i]}`)
    const prev = seenKeys.current
    seenKeys.current = new Set(keys)
    if (prev === null) return // 1ª carga: não anuncia o que já estava lá
    if (!soundOn) return
    const novasDescarregado = pendencias.filter((_, i) => !prev.has(keys[i]) && estados[i] === 'descarregado')
    if (!novasDescarregado.length) return
    // Até 3 novidades: anuncia cada uma. Acima disso, um resumo falado — nunca
    // silenciar alerta (perder "baixar manifesto" derrota a tela), nem
    // enfileirar N frases de voz num pico de fim de turno.
    if (novasDescarregado.length <= 3) {
      for (const p of novasDescarregado) {
        beepUrgente()
        speak(`Manifesto ${manifestoLabel(p)}, placa ${cavaloDe(p)}, entrega concluída. Baixar.`)
      }
    } else {
      beepUrgente()
      speak(`${novasDescarregado.length} manifestos entraram em descarregado. Baixar.`)
    }
  }, [pendencias, soundOn])

  const total = pendencias.length
  const contagemPorEstado = useMemo(() => {
    const c: Record<EstadoManifesto, number> = { descarregado: 0, descarregando: 0, aguardando_descarga: 0, em_transito: 0, sem_rastreio: 0 }
    for (const p of pendencias) c[deriveEstado(p)]++
    return c
  }, [pendencias])
  const vencidoCount = useMemo(() => pendencias.filter(vencido).length, [pendencias])

  // Ordenação + filtro.
  const rows = useMemo(() => {
    const filtradas = pendencias.filter((p) => {
      if (estadoFiltro !== 'todos' && deriveEstado(p) !== estadoFiltro) return false
      if (soVencido && !vencido(p)) return false
      return true
    })
    return [...filtradas].sort((a, b) => {
      const ra = rankEstado(a)
      const rb = rankEstado(b)
      if (ra !== rb) return ra - rb
      if (ra === 0) return (b.horas_atraso ?? 0) - (a.horas_atraso ?? 0)
      const ha = horasAbertoDe(a, now) ?? -1
      const hb = horasAbertoDe(b, now) ?? -1
      return hb - ha
    })
  }, [pendencias, estadoFiltro, soVencido, now])

  const stale = (snapshot?.idade_min ?? 0) > 15

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl bg-card px-5 py-4" style={{ border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2" style={{ background: 'linear-gradient(310deg,#0d2055,#1a4fc4)' }}>
            <PackageCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-primary">Baixa de Manifesto</h1>
            <p className="text-xs text-muted-foreground">Angellira (SM) + Sascar/Rodopar · atualiza a cada 30s</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => {
              // SEMPRE no clique (no stack do gesto = desbloqueia autoplay e confirma
              // na hora): bip + voz de teste. Também alterna o estado de anúncio.
              unlockAudio()
              primeSpeech()
              beep()
              speak('Som do painel de manifestos ativado')
              setSoundOn((v) => !v)
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

      {/* Banner de staleness */}
      {stale && (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <span>⚠ Coletor sem enviar há {Math.round(snapshot?.idade_min ?? 0)} min</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl bg-card px-4 py-3" style={{ border: '1px solid var(--border)' }}>
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{total}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">TOTAL ABERTOS</div>
        </div>
        {ESTADOS.map((e) => (
          <div key={e.key} className="rounded-xl bg-card px-4 py-3" style={{ border: '1px solid var(--border)' }}>
            <div className="text-3xl font-bold tabular-nums" style={{ color: e.fg }}>{contagemPorEstado[e.key]}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{e.emoji} {e.label.toUpperCase()}</div>
          </div>
        ))}
        <div className="rounded-xl bg-card px-4 py-3" style={{ border: '1px solid var(--border)' }}>
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'var(--status-atrasado-fg)' }}>{vencidoCount}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PRAZO VENCIDO</div>
        </div>
      </div>

      {/* Filtro rápido — 85 itens não rola sem filtro */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setEstadoFiltro('todos')}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={estadoFiltro === 'todos'
            ? { background: 'var(--primary)', color: 'white' }
            : { background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          Todos ({total})
        </button>
        {ESTADOS.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => setEstadoFiltro((v) => (v === e.key ? 'todos' : e.key))}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={estadoFiltro === e.key ? { background: e.fg, color: 'white' } : { background: e.bg, color: e.fg }}
          >
            {e.emoji} {e.label} ({contagemPorEstado[e.key]})
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSoVencido((v) => !v)}
          className="ml-2 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={soVencido
            ? { background: 'var(--status-atrasado-fg)', color: 'white' }
            : { background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          ⏰ Só prazo vencido
        </button>
      </div>

      {/* Tabela + painel de detalhes (clique na linha) */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <PanelCard
            title={<span className="flex items-center gap-2 text-sm"><PackageCheck className="h-4 w-4 text-primary" /> Manifestos abertos</span>}
            subtitle={`${rows.length} de ${total}`}
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground" style={{ borderColor: 'var(--border)' }}>
                    <th className="px-3 py-2.5 font-medium">Manifesto</th>
                    <th className="px-3 py-2.5 font-medium">Estado</th>
                    <th className="px-3 py-2.5 font-medium">Prazo</th>
                    <th className="px-3 py-2.5 font-medium">Cavalo</th>
                    <th className="px-3 py-2.5 font-medium">Motorista</th>
                    <th className="w-10 px-2 py-2.5 text-center font-medium" title="Contatos">
                      <Phone className="mx-auto h-3.5 w-3.5" />
                    </th>
                    <th className="px-3 py-2.5 font-medium">Cliente/Destino</th>
                    <th className="px-3 py-2.5 font-medium">Km do destino</th>
                    <th className="px-3 py-2.5 font-medium">Aberto há</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const key = chaveManifesto(p)
                    const estado = deriveEstado(p)
                    const info = ESTADO_INFO[estado]
                    const horasAberto = horasAbertoDe(p, now)
                    const cliente = p.sm?.cliente || p.destino || '—'
                    const destinoLinha = [p.destino, p.destino_uf ?? p.viagem?.destino_uf].filter(Boolean).join('/')
                    return (
                      <tr
                        key={key}
                        className="cursor-pointer border-b hover:bg-muted/30"
                        style={{ borderColor: 'var(--border)', background: key === selectedKey ? 'rgba(26,79,196,0.08)' : undefined }}
                        onClick={() => setSelectedKey(key)}
                      >
                        <td className="px-3 py-2">
                          {p.codman != null ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
                              <span className="font-mono font-bold">{p.codman}</span>
                              <span className="text-[9px] text-muted-foreground">f{p.filial ?? '—'}{p.serie ? `/${p.serie}` : ''}</span>
                            </span>
                          ) : p.manifestos?.length ? (
                            <div className="flex flex-wrap items-center gap-1">
                              {p.manifestos.map((m) => (
                                <span key={m.codman} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
                                  <span className="font-mono font-bold">{m.codman}</span>
                                  <span className="text-[9px] text-muted-foreground">f{m.filial}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">aguardando emissão</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold whitespace-nowrap"
                              style={{ background: info.bg, color: info.fg }}
                            >
                              {info.emoji} {info.label}
                            </span>
                            {p.origem_estado && (
                              <span
                                className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                                style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                                title="Origem do veredito do estado"
                              >
                                {ORIGEM_LABEL[p.origem_estado]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <div className="text-muted-foreground">{fmtLocal(p.prazo_entrega_local)}</div>
                          {vencido(p) && (
                            <div className="font-semibold" style={{ color: 'var(--status-atrasado-fg)' }}>
                              atraso {Math.round(p.horas_atraso!)}h
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-mono">{cavaloDe(p)}</div>
                          <div className="text-[10px] text-muted-foreground">{carretaDe(p)}</div>
                        </td>
                        <td className="px-3 py-2 font-medium">{p.motorista || '—'}</td>
                        {/* coluna própria: ícone sempre alinhado, independente do tamanho do nome */}
                        <td className="w-10 px-2 py-2 text-center">
                          {contatosDaPendencia(p).length > 0 && (
                            <button
                              type="button"
                              className="rounded-md p-1 text-primary hover:bg-muted"
                              title="Ver telefones cadastrados"
                              onClick={(e) => { e.stopPropagation(); setContatosDe(key) }}
                            >
                              <Phone className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-foreground">{cliente}</div>
                          <div className="text-[10px] text-muted-foreground">{destinoLinha || '—'}</div>
                        </td>
                        <td className="px-3 py-2">{fmtKm(kmDestinoDe(p))}</td>
                        <td className="px-3 py-2">
                          {horasAberto == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={horasAberto > 24 ? 'font-semibold' : undefined} style={horasAberto > 24 ? { color: 'var(--status-atrasado-fg)' } : undefined}>
                              {formatDuration(Math.round(horasAberto * 60))}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">{isLoading ? 'Carregando manifestos…' : 'Nenhum manifesto aberto com esse filtro.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </div>

        {selected && (
          <FixedPanel>
            <ManifestoDetailPanel pendencia={selected} now={now} onClose={() => setSelectedKey(null)} />
          </FixedPanel>
        )}
      </div>

      <ContatosDialog pendencia={pendenciaContatos} onClose={() => setContatosDe(null)} />
    </div>
  )
}

// ── Painel de detalhes (clique na linha) ────────────────────────────────────
// Só leitura — a baixa continua no Rodopar. Ficha label+valor no estilo do
// TripDetailPanel (viagens): grid 2 colunas, seções com header uppercase.

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-foreground truncate">{value}</p>
    </div>
  )
}

// Modal de contatos: aberto pelo ícone 📞 da tabela. Lista um botão por número
// (o motorista pode ter celular E telefone diferentes) — clique disca via tel:.
function ContatosDialog({
  pendencia, onClose,
}: { pendencia: PendenciaManifesto | null; onClose: () => void }) {
  const contatos = pendencia ? contatosDaPendencia(pendencia) : []
  return (
    <Dialog open={!!pendencia} onOpenChange={(aberto) => { if (!aberto) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Contatos do motorista</DialogTitle>
        </DialogHeader>
        {pendencia && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Cavalo <span className="font-mono">{cavaloDe(pendencia)}</span>
            {' · '}manifesto <span className="font-mono">{manifestoLabel(pendencia)}</span>
          </p>
        )}
        <div className="space-y-4">
          {contatos.map((c) => (
            <div key={c.nome}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.nome}</p>
              <div className="space-y-1.5">
                {c.fones.map((f) => (
                  <a
                    key={f.numero}
                    href={`tel:+55${f.numero.replace(/\D/g, '')}`}
                    className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-primary" />
                      <span className="font-mono text-sm font-medium text-foreground">{f.numero}</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.rotulo}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
          {contatos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum telefone cadastrado para esta viagem.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Motorista no painel de detalhes: nome + TODOS os números cadastrados, cada um
// em linha própria e clicável (nome comprido não engole mais o telefone).
function MotoristaLinha({ nome, fones }: { nome: string; fones?: Telefone[] }) {
  return (
    <span className="block">
      <span className="block truncate" title={nome}>{nome}</span>
      {(fones ?? []).map((f) => (
        <a
          key={f.numero}
          href={`tel:+55${f.numero.replace(/\D/g, '')}`}
          className="block font-mono text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
          title={f.rotulo}
        >
          📞 {f.numero}
        </a>
      ))}
    </span>
  )
}

function ManifestoDetailPanel({ pendencia: p, now, onClose }: { pendencia: PendenciaManifesto; now: Date; onClose: () => void }) {
  const estado = deriveEstado(p)
  const info = ESTADO_INFO[estado]
  const horasAberto = horasAbertoDe(p, now)
  const posMin = minutesSinceLocal(p.posicao?.quando_local, now)
  const macroMin = minutesSinceLocal(p.macro?.quando_local, now)
  const contatos = contatosDaPendencia(p)
  const evidenciasV2 = Array.isArray(p.evidencias) ? p.evidencias : null
  const temGrade = p.sm?.grade_inicio_local != null || p.sm?.grade_fim_local != null

  return (
    <SidePanelLayout title={`Manifesto ${manifestoLabel(p)}`} subtitle={p.sm?.cliente || p.destino || undefined} onClose={onClose}>
      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
            <span className="font-mono font-bold text-sm">{manifestoLabel(p)}</span>
            <span className="text-[10px] text-muted-foreground">f{p.filial ?? '—'}{p.serie ? `/${p.serie}` : ''}</span>
          </span>
          <span
            className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold"
            style={{ background: info.bg, color: info.fg }}
          >
            {info.emoji} {info.label}
          </span>
        </div>

        {/* (1) Manifesto */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Manifesto</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Emissão" value={fmtLocal(p.emissao_local)} />
            <Metric label="Prazo de entrega" value={fmtLocal(p.prazo_entrega_local)} />
            <Metric label="Atraso" value={vencido(p) ? `${Math.round(p.horas_atraso!)}h` : 'no prazo'} />
            <Metric label="Aberto há" value={horasAberto == null ? '—' : formatDuration(Math.round(horasAberto * 60))} />
          </div>
        </div>

        {/* (2) SM Angellira */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">SM Angellira</h4>
          {p.sm ? (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Metric label="Código" value={p.sm.codigo || '—'} />
              <Metric label="Status viagem" value={p.sm.status_viagem || '—'} />
              <Metric label="Status entrega" value={p.sm.status_entrega || '—'} />
              <Metric label="Cliente" value={p.sm.cliente || '—'} />
              <Metric label="Chegada" value={fmtLocal(p.sm.chegada_local)} />
              <Metric label="Saída" value={fmtLocal(p.sm.saida_local)} />
              <Metric label="Tempo de descarga" value={p.sm.tempo_descarga || '—'} />
              <Metric label="Atraso (SM)" value={p.sm.atraso || '—'} />
              <Metric label="Km faltante" value={fmtKm(p.sm.km_faltante ?? null)} />
              <Metric label="Previsão de chegada" value={fmtLocal(p.sm.previsao_chegada_local)} />
              {temGrade && (
                <>
                  <Metric label="Grade início" value={fmtLocal(p.sm.grade_inicio_local)} />
                  <Metric label="Grade fim" value={fmtLocal(p.sm.grade_fim_local)} />
                </>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">— sem SM vinculada (plano B: Sascar/macro)</p>
          )}
        </div>

        {/* (3) Viagem/Veículo */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Viagem / Veículo</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Cavalo" value={cavaloDe(p)} />
            <Metric label="Carreta" value={carretaDe(p)} />
            <Metric label="Destino" value={[p.destino, p.destino_uf ?? p.viagem?.destino_uf].filter(Boolean).join('/') || '—'} />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Motorista(s)</p>
              <div className="text-sm font-medium text-foreground">
                {contatos.length > 0
                  ? contatos.map((c) => <MotoristaLinha key={c.nome} nome={c.nome} fones={c.fones} />)
                  : <span>{p.motorista || '—'}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* (4) Sascar */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Sascar</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Cidade/UF" value={p.posicao ? `${p.posicao.cidade || '—'}/${p.posicao.uf || '—'}` : '—'} />
            <Metric label="Km do destino" value={fmtKm(p.posicao?.km_destino ?? null)} />
            <Metric label="Parado" value={p.posicao?.parado == null ? '—' : p.posicao.parado ? 'sim' : 'não'} />
            <Metric label="Transmitiu" value={posMin == null ? '—' : `há ${formatDuration(posMin)}`} />
            {p.posicao?.ponto_referencia && (
              <Metric
                label="Ponto de referência"
                value={`${p.posicao.ponto_referencia}${p.posicao.distancia_m != null ? ` · ${fmtDistancia(p.posicao.distancia_m)}` : ''}`}
              />
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <Metric label="Trava do baú" value={p.trava_bau?.estado || '—'} />
            <Metric label="Destravou no destino" value={fmtLocal(p.trava_bau?.destravou_no_destino_local)} />
          </div>

          <div className="mt-3 rounded-md border p-2.5" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Última macro</p>
            <p className="text-xs text-foreground">{p.macro?.ultima || '—'}</p>
            <p className="text-[10px] text-muted-foreground">{macroMin == null ? '—' : `há ${formatDuration(macroMin)}`}</p>
            {(p.macro?.digitado || p.digitado) && (
              <>
                <p className="mt-2 whitespace-pre-wrap font-mono text-xs text-foreground">{p.macro?.digitado || p.digitado}</p>
                <p className="mt-1 text-[10px] italic text-muted-foreground">campo livre digitado na boleia — apenas referência</p>
              </>
            )}
          </div>
        </div>

        {/* (5) Evidências */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Evidências</h4>
          {evidenciasV2 && evidenciasV2.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {evidenciasV2.map((ev) => (
                <span
                  key={ev}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                  style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                >
                  {ev}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">—</p>
          )}
        </div>
      </div>
    </SidePanelLayout>
  )
}
