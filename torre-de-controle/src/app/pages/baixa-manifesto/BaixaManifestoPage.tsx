import { useEffect, useMemo, useRef, useState } from 'react'
import { PackageCheck, Volume2, VolumeX } from 'lucide-react'
import { PanelCard } from '@/components/domain/PanelCard'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { FixedPanel } from '@/components/domain/FixedPanel'
import { Button } from '@/components/ui/button'
import { useManifestoPendencias, type PendenciaManifesto } from '@/hooks/useManifestoPendencias'
import { useNow } from '@/hooks/useNow'
import { formatDuration } from '@/lib/formatters'
import { unlockAudio, beep, speak, primeSpeech } from '@/lib/audioAlert'

/**
 * Baixa de Manifesto — pendências de baixa (Sascar + Rodopar), snapshot publicado
 * pelo coletor no torre (Redis) e lido aqui com polling 30s (F3).
 *   • KPIs por estágio
 *   • Tabela ordenada: 🔴 descarregado primeiro, depois maior tempo decorrido
 *   • Som (reusa o motor de src/lib/audioAlert.ts): 🟡 1 beep · 🔴 2 beeps + voz
 */

// de-para estágio → cor (Argon) + rótulo da pill.
function statusTone(estagio: string): { bg: string; fg: string; label: string } {
  if (estagio === 'descarregado') {
    return { bg: 'var(--status-atrasado-bg)', fg: 'var(--status-atrasado-fg)', label: '🔴 Descarregado — baixar' }
  }
  return { bg: 'var(--status-em-risco-bg)', fg: 'var(--status-em-risco-fg)', label: '🟡 Descarregando' }
}

// *_local é literal "wall-clock" (já em horário local) — nunca reinterpretar via
// `new Date(str)` (o fuso do navegador pode não bater com o do servidor). Extrai
// os componentes por regex e reformata dd/MM/yyyy HH:mm sem tocar no relógio.
function fmtLocal(iso: string | null): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return iso
  const [, y, mo, d, h, mi] = m
  return `${d}/${mo}/${y} ${h}:${mi}`
}

// Tempo decorrido é calculado por *_gmt (UTC, sem sufixo 'Z' no payload) — anexa o
// 'Z' antes de criar o Date para não reinterpretar como horário local do navegador.
function parseGmt(iso: string | null): Date | null {
  if (!iso) return null
  const d = new Date(`${iso}Z`)
  return isNaN(d.getTime()) ? null : d
}

function elapsedMinutes(p: PendenciaManifesto, now: Date): number | null {
  const base = parseGmt(p.fim_gmt) ?? parseGmt(p.chegada_gmt)
  if (!base) return null
  return Math.max(0, Math.round((now.getTime() - base.getTime()) / 60_000))
}

// posicao.quando_local (Sascar) é literal wall-clock igual chegada_local/fim_local —
// constrói o Date a partir dos MESMOS componentes no relógio local do navegador
// (sem `new Date(str)` direto, que reinterpretaria pelo fuso do navegador) para
// poder subtrair de `now` e ter "transmitiu há X min".
function minutesSinceLocal(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const base = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? '0'))
  return Math.max(0, Math.round((now.getTime() - base.getTime()) / 60_000))
}

// Distância Sascar (ponto de referência) chega em metros — exibe em km com 1
// decimal a partir de 1000m, senão em metros inteiros.
function fmtDistancia(m: number | null | undefined): string {
  if (m == null) return '—'
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m)} m`
}

// Dois beeps em sequência (🔴 descarregado) — aguarda o 1º terminar antes do 2º.
async function beepUrgente() {
  await beep(1175)
  await new Promise((r) => setTimeout(r, 150))
  await beep(1175)
}

export function BaixaManifestoPage() {
  const { data: snapshot, pendencias, isLoading } = useManifestoPendencias()
  const now = useNow(30_000)
  const [soundOn, setSoundOn] = useState(true)
  const seenEvents = useRef<Set<string> | null>(null)
  // Painel de detalhes: guarda só o codlpr, não o objeto — a cada render re-deriva
  // do array (fresco a cada polling de 30s); some sozinho da lista (baixada) = null = painel fecha.
  const [selectedCodlpr, setSelectedCodlpr] = useState<number | null>(null)
  const selected = pendencias.find((p) => p.codlpr === selectedCodlpr) ?? null

  // Desbloqueia áudio + voz no 1º gesto do usuário (autoplay policy do navegador).
  useEffect(() => {
    const unlock = () => { unlockAudio(); primeSpeech(); window.removeEventListener('pointerdown', unlock) }
    window.addEventListener('pointerdown', unlock)
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  // Som quando uma pendência é nova OU vira 🟡→🔴. Chave = codlpr|estagio (a virada
  // de estágio muda a chave, então é detectada como "nova"). 1ª carga não anuncia.
  useEffect(() => {
    if (!pendencias.length) return
    const keys = pendencias.map((p) => `${p.codlpr}|${p.estagio}`)
    const prev = seenEvents.current
    seenEvents.current = new Set(keys)
    if (prev === null) return // 1ª carga: não anuncia o que já estava lá
    if (!soundOn) return
    const novas = pendencias.filter((_, i) => !prev.has(keys[i]))
    if (!novas.length) return
    // Até 3 novidades: anuncia cada uma. Acima disso, um resumo falado — nunca
    // silenciar alerta (perda muda de "baixar manifesto" derrota a tela), nem
    // enfileirar 10 frases de voz num pico de fim de turno.
    if (novas.length <= 3) {
      for (const p of novas) {
        if (p.estagio === 'descarregado') {
          beepUrgente()
          const codmans = p.manifestos.map((m) => m.codman).join(', ') || 'sem manifesto'
          speak(`Manifesto ${codmans}, placa ${p.placa}, descarregado. Baixar.`)
        } else {
          beep(880)
        }
      }
    } else {
      const urgentes = novas.filter((p) => p.estagio === 'descarregado').length
      beepUrgente()
      speak(urgentes > 0
        ? `${novas.length} novas pendências de manifesto, ${urgentes} descarregadas. Verificar painel.`
        : `${novas.length} novas pendências de manifesto. Verificar painel.`)
    }
  }, [pendencias, soundOn])

  const total = pendencias.length
  const descarregadoCount = pendencias.filter((p) => p.estagio === 'descarregado').length
  const descarregandoCount = pendencias.filter((p) => p.estagio === 'descarregando').length

  // Ordenação: descarregado primeiro, depois maior tempo decorrido.
  const rows = useMemo(() => {
    return [...pendencias].sort((a, b) => {
      if (a.estagio !== b.estagio) return a.estagio === 'descarregado' ? -1 : 1
      const ea = elapsedMinutes(a, now) ?? -1
      const eb = elapsedMinutes(b, now) ?? -1
      return eb - ea
    })
  }, [pendencias, now])

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
            <p className="text-xs text-muted-foreground">Sascar + Rodopar · atualiza a cada 30s</p>
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-card px-4 py-3" style={{ border: '1px solid var(--border)' }}>
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{total}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">TOTAL</div>
        </div>
        <div className="rounded-xl bg-card px-4 py-3" style={{ border: '1px solid var(--border)' }}>
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'var(--status-atrasado-fg)' }}>{descarregadoCount}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">DESCARREGADO (BAIXAR)</div>
        </div>
        <div className="rounded-xl bg-card px-4 py-3" style={{ border: '1px solid var(--border)' }}>
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'var(--status-em-risco-fg)' }}>{descarregandoCount}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">DESCARREGANDO</div>
        </div>
      </div>

      {/* Tabela + painel de detalhes (clique na linha) */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <PanelCard
            title={<span className="flex items-center gap-2 text-sm"><PackageCheck className="h-4 w-4 text-primary" /> Pendências de baixa</span>}
            subtitle={`${rows.length} pendência(s)`}
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground" style={{ borderColor: 'var(--border)' }}>
                    <th className="px-3 py-2.5 font-medium">Manifesto(s)</th>
                    <th className="px-3 py-2.5 font-medium">Estágio</th>
                    <th className="px-3 py-2.5 font-medium">Placa</th>
                    <th className="px-3 py-2.5 font-medium">Motorista</th>
                    <th className="px-3 py-2.5 font-medium">Cliente/Destino</th>
                    <th className="px-3 py-2.5 font-medium">Chegada</th>
                    <th className="px-3 py-2.5 font-medium">Fim</th>
                    <th className="px-3 py-2.5 font-medium">Tempo decorrido</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const tone = statusTone(p.estagio)
                    const elapsed = elapsedMinutes(p, now)
                    return (
                      <tr
                        key={p.codlpr}
                        className="cursor-pointer border-b hover:bg-muted/30"
                        style={{ borderColor: 'var(--border)', background: p.codlpr === selectedCodlpr ? 'rgba(26,79,196,0.08)' : undefined }}
                        onClick={() => setSelectedCodlpr(p.codlpr)}
                      >
                        <td className="px-3 py-2">
                          {p.manifestos.length === 0 ? (
                            <span className="text-muted-foreground italic">aguardando emissão</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {p.manifestos.map((m) => (
                                <span key={m.codman} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
                                  <span className="font-mono font-bold">{m.codman}</span>
                                  <span className="text-[9px] text-muted-foreground">f{m.filial}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold"
                              style={{ background: tone.bg, color: tone.fg }}
                            >
                              {tone.label}
                            </span>
                            {p.posicao_diverge && (
                              <span
                                className="text-sm"
                                title="⚠ Posição do caminhão no momento da macro NÃO bate com o destino da viagem — confirme antes de baixar (macro pode ter sido apertada por engano)"
                              >
                                ⚠️
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono">{p.placa}</td>
                        <td className="px-3 py-2 font-medium">{p.motorista || '—'}</td>
                        <td className="px-3 py-2">
                          <div className="text-foreground">{p.cliente || '—'}</div>
                          <div className="text-[10px] text-muted-foreground">{p.destino || '—'}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtLocal(p.chegada_local)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtLocal(p.fim_local)}</td>
                        <td className="px-3 py-2">
                          {elapsed == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={elapsed > 60 ? 'font-semibold' : undefined} style={elapsed > 60 ? { color: 'var(--status-atrasado-fg)' } : undefined}>
                              {formatDuration(elapsed)}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">{isLoading ? 'Carregando pendências…' : 'Nenhuma pendência de baixa de manifesto.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </div>

        {selected && (
          <FixedPanel>
            <ManifestoDetailPanel pendencia={selected} now={now} onClose={() => setSelectedCodlpr(null)} />
          </FixedPanel>
        )}
      </div>
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

// Motorista com celular clicável (tel:) — fone vem do RODMOT.TELCEL via coletor.
function MotoristaLinha({ nome, fone }: { nome: string; fone?: string }) {
  const digitos = (fone ?? '').replace(/\D/g, '')
  return (
    <span className="block truncate">
      {nome}
      {fone && digitos && (
        <>
          {' · '}
          <a href={`tel:+55${digitos}`} className="font-mono text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {fone}
          </a>
        </>
      )}
    </span>
  )
}

function ManifestoDetailPanel({ pendencia, now, onClose }: { pendencia: PendenciaManifesto; now: Date; onClose: () => void }) {
  const tone = statusTone(pendencia.estagio)
  const title = pendencia.manifestos.length > 0
    ? `Manifesto(s) ${pendencia.manifestos.map((m) => m.codman).join(', ')}`
    : `Pendência ${pendencia.placa}`
  const elapsed = elapsedMinutes(pendencia, now)
  const posMin = minutesSinceLocal(pendencia.posicao?.quando_local, now)

  return (
    <SidePanelLayout title={title} subtitle={pendencia.cliente || undefined} onClose={onClose}>
      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex flex-wrap items-center gap-1.5">
            {pendencia.manifestos.length === 0 ? (
              <span className="text-sm text-muted-foreground italic">aguardando emissão</span>
            ) : (
              pendencia.manifestos.map((m) => (
                <span key={m.codman} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                  <span className="font-mono font-bold text-sm">{m.codman}</span>
                  <span className="text-[10px] text-muted-foreground">f{m.filial}</span>
                </span>
              ))
            )}
          </div>
          <span
            className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {tone.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Programação nº <span className="font-mono text-foreground">{pendencia.codlpr}</span>
        </p>

        {/* Viagem */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Viagem</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Origem → Destino" value={`${pendencia.viagem?.origem || '—'} → ${pendencia.destino || '—'}`} />
            <Metric label="Saída" value={fmtLocal(pendencia.viagem?.saida_local ?? null)} />
            <Metric label="Previsão de chegada" value={fmtLocal(pendencia.viagem?.previsao_local ?? null)} />
            <Metric label="Placa / Carreta" value={`${pendencia.placa || '—'} / ${pendencia.viagem?.carreta || '—'}`} />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Motorista(s)</p>
              <div className="text-sm font-medium text-foreground">
                {pendencia.motorista
                  ? <MotoristaLinha nome={pendencia.motorista} fone={pendencia.viagem?.motorista_fone} />
                  : <span>—</span>}
                {pendencia.viagem?.motorista2 && (
                  <MotoristaLinha nome={pendencia.viagem.motorista2} fone={pendencia.viagem?.motorista2_fone} />
                )}
              </div>
            </div>
            <Metric label="Cliente" value={pendencia.cliente || '—'} />
          </div>
        </div>

        {/* Descarga */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Descarga</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Chegada" value={fmtLocal(pendencia.chegada_local)} />
            <Metric label="Fim de viagem" value={fmtLocal(pendencia.fim_local)} />
            <Metric label="Tempo decorrido" value={elapsed == null ? '—' : formatDuration(elapsed)} />
            <Metric label="Detectada em" value={fmtLocal(pendencia.detectada_em)} />
          </div>
        </div>

        {/* Sascar */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Sascar — última posição</h4>
          {pendencia.posicao_diverge && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[11px] text-warning">
              <span>⚠️</span>
              <span>
                A posição do caminhão no momento da macro <b>não bate com o destino da viagem</b> —
                a macro pode ter sido apertada por engano. Confirme com a operação antes de baixar.
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Cidade/UF" value={pendencia.posicao ? `${pendencia.posicao.cidade || '—'}/${pendencia.posicao.uf || '—'}` : '—'} />
            <Metric
              label="Ponto de referência"
              value={pendencia.posicao?.ponto_referencia
                ? `${pendencia.posicao.ponto_referencia}${pendencia.posicao.distancia_m != null ? ` · ${fmtDistancia(pendencia.posicao.distancia_m)}` : ''}`
                : '—'}
            />
            <Metric label="Transmitiu" value={posMin == null ? '—' : `há ${formatDuration(posMin)}`} />
          </div>

          <div className="mt-3 rounded-md border p-2.5" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">O que o motorista digitou</p>
            <p className="whitespace-pre-wrap font-mono text-xs text-foreground">{pendencia.digitado || '—'}</p>
            <p className="mt-1 text-[10px] italic text-muted-foreground">campo livre digitado na boleia — apenas referência</p>
          </div>
        </div>

        {/* Evidências — fase de observação (não altera regras) */}
        {pendencia.evidencias && (
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Evidências físicas</h4>
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">Confirmado por:</span>
              {(['macro', 'posicao', 'bau'] as const).map((fonte) => {
                const ok = pendencia.evidencias!.confirmado_por.includes(fonte)
                const rotulo = fonte === 'macro' ? 'Macro' : fonte === 'posicao' ? 'Posição' : 'Baú'
                return (
                  <span
                    key={fonte}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                    style={ok
                      ? { background: 'var(--status-no-prazo-bg, rgba(34,197,94,.12))', color: 'var(--status-no-prazo-fg, #16a34a)' }
                      : { background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                  >
                    {ok ? '✓' : '—'} {rotulo}
                  </span>
                )
              })}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Metric
                label="Na cidade do destino"
                value={pendencia.evidencias.na_cidade_destino
                  ? `sim${pendencia.evidencias.cerca_desde_local ? ` · desde ${fmtLocal(pendencia.evidencias.cerca_desde_local).slice(11)}` : ''}`
                  : 'não'}
              />
              <Metric label="Parado" value={pendencia.evidencias.parado ? 'sim' : 'não'} />
              <Metric
                label="Sensor do baú"
                value={pendencia.evidencias.bau_sensor_presente === null || pendencia.evidencias.bau_sensor_presente === false
                  ? 'sem sensor'
                  : pendencia.evidencias.bau_ativo_sustentado
                    ? `sinal ativo${pendencia.evidencias.bau_ativo_desde_local ? ` desde ${fmtLocal(pendencia.evidencias.bau_ativo_desde_local).slice(11)}` : ''}`
                    : pendencia.evidencias.bau_ativo ? 'ativo (1ª leitura — aguardando confirmação)' : 'inativo'}
              />
              <Metric label="Ruído do sensor no destino" value={`${pendencia.evidencias.bau_transicoes_no_destino} transição(ões)`} />
            </div>
            <p className="mt-2 text-[10px] italic text-muted-foreground">
              fase de observação — semântica do sensor em validação; estas evidências ainda não mudam o estágio
            </p>
          </div>
        )}
      </div>
    </SidePanelLayout>
  )
}
