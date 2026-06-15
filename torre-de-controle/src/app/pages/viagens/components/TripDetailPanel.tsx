import { useState } from 'react'
import { Phone, StickyNote, AlertTriangle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { LiveMap } from '@/components/domain/LiveMap'
import { TripTimeline } from '@/components/domain/TripTimeline'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { RiskBadge } from '@/components/domain/RiskBadge'
import { CommunicationsLog } from '@/components/domain/CommunicationsLog'
import { LogCallDialog } from '@/components/domain/LogCallDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { useDriverTrack } from '@/hooks/useDriverTrack'
import { type VeiculoDossie } from '@/hooks/useTripDossie'
import { useViagem360 } from '@/hooks/useViagem360'
import { formatKm, formatDate } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Trip } from '@/data/types'

interface Props {
  trip: Trip
  onClose: () => void
}

export function TripDetailPanel({ trip, onClose }: Props) {
  // Visão 360 — UMA chamada cacheada (20s no servidor) com tudo cruzado; polling 12s
  // mantém a viagem aberta sempre fresca sem martelar os sistemas.
  const { data: v360 } = useViagem360(trip.id)
  const events = (v360?.timeline ?? []) as any
  const risk   = v360?.risco ?? null
  const gps    = v360?.gps ?? null
  // Trajeto do motorista p/ traçar a rota no mapa.
  const { data: track } = useDriverTrack(trip.driverName || null)
  // Dossiê cruzado (motorista+ranking+cargas+veículos) vem do mesmo envelope 360.
  const cross = v360
  // Datas de vigência são date-only (chegam como string 'YYYY-MM-DD' ou Date) —
  // formata em UTC p/ não deslocar -1 dia pelo fuso (-03:00).
  const fmtDia = (s: string | Date | null | undefined) => {
    if (!s) return ''
    const d = new Date(s)
    if (isNaN(d.getTime())) return String(s)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
  }
  const qc = useQueryClient()
  const remainingKm = Math.max(0, trip.distanceTotal - trip.distanceDone)

  const [callOpen, setCallOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [occOpen, setOccOpen]   = useState(false)
  const [noteText, setNoteText] = useState('')
  const [occTitle, setOccTitle] = useState('')
  const [occSeverity, setOccSeverity] = useState<'critico' | 'medio' | 'baixo'>('medio')

  const postNote = useMutation({
    mutationFn: async () => {
      const { error } = await (api.api.trips as any)[trip.id].note.post({ text: noteText })
      if (error) throw new Error('Falha ao salvar nota')
    },
    onSuccess: () => {
      setNoteText(''); setNoteOpen(false)
      qc.invalidateQueries({ queryKey: ['viagem360', trip.id] })
    },
  })

  const postOcc = useMutation({
    mutationFn: async () => {
      const { error } = await (api.api.alerts as any).post({
        type: 'manual', severity: occSeverity, title: occTitle,
        tripId: trip.id, driverId: trip.driverId,
      })
      if (error) throw new Error('Falha ao abrir ocorrência')
    },
    onSuccess: () => {
      setOccTitle(''); setOccOpen(false)
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['viagem360', trip.id] })
    },
  })

  return (
    <SidePanelLayout
      title={trip.lh || trip.code}
      subtitle={[trip.clientName, trip.lh ? `LH ${trip.lh}` : trip.code, trip.cargasStatus].filter(Boolean).join(' · ')}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 text-xs gap-1.5" onClick={() => setCallOpen(true)}><Phone className="h-3.5 w-3.5" /> Ligar</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setNoteOpen(true)}><StickyNote className="h-3.5 w-3.5" /> Nota</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setOccOpen(true)}><AlertTriangle className="h-3.5 w-3.5" /> Ocorrência</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <StatusBadge status={trip.slaStatus} size="md" />
            <RiskBadge level={risk?.level ?? trip.riskLevel} score={risk?.score ?? trip.riskScore} size="md" />
          </div>
          <span className="text-xs text-muted-foreground">Prioridade: <strong className="text-foreground capitalize">{trip.priority}</strong></span>
        </div>

        {risk && risk.factors.length > 0 && (
          <div className="rounded-md border border-border p-2.5 bg-card space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Score de risco · {risk.score}</p>
            <ul className="space-y-1">
              {risk.factors.map((f) => (
                <li key={f.key} className="flex items-center gap-2 text-[11px]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-foreground truncate">{f.label}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0">{f.contribution}/{f.weight}</span>
                    </div>
                    {f.detail && <p className="text-[10px] text-muted-foreground truncate">{f.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <LiveMap height={220} showLegend={false} track={track} driverOnly />

        <div className="grid grid-cols-2 gap-3 text-xs">
          <Metric label="Motorista" value={trip.driverName} />
          {trip.lh && <Metric label="LH" value={trip.lh} />}
          {(trip.cavalo || trip.carreta) && <Metric label="Cavalo / Carreta" value={[trip.cavalo, trip.carreta].filter(Boolean).join(' / ') || '—'} />}
          {trip.cargasStatus && <Metric label="Status operacional" value={trip.cargasStatus} />}
          <Metric label="Origem" value={trip.origin} />
          <Metric label="Destino" value={trip.destination} />
          <Metric label="Partida" value={trip.windowStart ? formatDate(trip.windowStart, 'dd/MM/yyyy HH:mm:ss') : '—'} />
          <Metric label="Prazo Final" value={trip.windowEnd ? formatDate(trip.windowEnd, 'dd/MM/yyyy HH:mm:ss') : '—'} />
          <Metric label="Previsão de Chegada" value={trip.eta ? formatDate(trip.eta, 'dd/MM/yyyy HH:mm:ss') : '—'} />
          <Metric
            label="Atraso"
            value={trip.atrasoLabel || '—'}
            valueClass={trip.adiantamentoHoras == null ? undefined : trip.adiantamentoHoras > 0.0167 ? 'text-[#f5365c]' : trip.adiantamentoHoras < -0.0167 ? 'text-[#2dce89]' : undefined}
          />
          {trip.valor != null && <Metric label="Valor frete" value={`R$ ${trip.valor.toLocaleString('pt-BR')}${trip.bonus ? ` (+${trip.bonus})` : ''}`} />}
          <Metric label="Distância total" value={formatKm(trip.distanceTotal)} />
          <Metric label="Km que Falta" value={formatKm(trip.kmFalta ?? remainingKm)} />
          <Metric label="Progresso" value={`${trip.progressPct}%`} />
          <Metric label="Meta KM/Dia" value={trip.metaKmDia ?? '—'} />
          <Metric label="Condução" value={(trip.conducaoRegime ?? 'intensivo') === 'intensivo' ? 'Intensivo' : 'Regular'} />
          {gps && <Metric label="Última posição GPS" value={`${[gps.cidade, gps.uf].filter(Boolean).join('/') || '—'} · ${formatDate(gps.at, 'dd/MM HH:mm')}`} />}
        </div>

        {/* Phase 14 — Motorista & Veículos cruzados (torre + ranking + cargas): vigências Angellira + detalhes */}
        {cross && (cross.motorista || cross.cavalo || cross.carreta) && (
          <div className="rounded-md border border-border bg-card p-2.5 space-y-2.5">
            {cross.motorista && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Motorista — {cross.motorista.nome}</p>
                  {cross.motorista.rankPosicao != null && (
                    <span className="text-[10px] text-muted-foreground">Rank #{cross.motorista.rankPosicao} · {cross.motorista.rankPontuacao ?? 0} pts</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {cross.motorista.angellira && <DocTag tone={/conforme/i.test(cross.motorista.angellira) ? 'ok' : 'warn'}>Angellira: {cross.motorista.angellira}{cross.motorista.vigenteAte ? ` · vigente até ${fmtDia(cross.motorista.vigenteAte)}` : ''}</DocTag>}
                  {cross.motorista.vinculo && <DocTag tone="muted">{cross.motorista.vinculo === 'FUN' ? 'Funcionário' : cross.motorista.vinculo === 'AGR' ? 'Agregado' : cross.motorista.vinculo}</DocTag>}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {cross.motorista.cpf && <KV k="CPF" v={maskCpf(cross.motorista.cpf)} />}
                  {cross.motorista.rg && <KV k="RG" v={cross.motorista.rg} />}
                  {cross.motorista.cnh && <KV k="CNH" v={`${cross.motorista.cnh}${cross.motorista.cnhCategoria ? ` · ${cross.motorista.cnhCategoria}` : ''}`} />}
                  {cross.motorista.cnhValidade && <KV k="CNH válida até" v={fmtDia(cross.motorista.cnhValidade)} />}
                  {cross.motorista.nascimento && <KV k="Nascimento" v={fmtDia(cross.motorista.nascimento)} />}
                  {cross.motorista.telefone && <KV k="Telefone" v={cross.motorista.telefone} />}
                  {cross.motorista.cidadeUf && <KV k="Cidade/UF" v={cross.motorista.cidadeUf} />}
                  {cross.motorista.email && <KV k="E-mail" v={cross.motorista.email} />}
                  {cross.motorista.score != null && <KV k="Score operacional" v={String(cross.motorista.score)} />}
                  {cross.motorista.bloqueado != null && <KV k="Bloqueado" v={cross.motorista.bloqueado ? 'Sim' : 'Não'} />}
                </div>
              </div>
            )}
            {(cross.cavalo || cross.carreta) && (
              <div className="space-y-1.5 border-t border-border pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Veículos</p>
                {([cross.cavalo, cross.carreta].filter(Boolean) as VeiculoDossie[]).map((v) => (
                  <div key={v.papel} className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-medium text-foreground capitalize">{v.papel}: {v.placa ?? '—'}</span>
                      {v.marcaModelo && <span className="text-[11px] text-muted-foreground">{v.marcaModelo}</span>}
                      {(v.angellira || v.vigenteAte) && <DocTag tone={/conforme|found/i.test(v.angellira ?? '') || v.vigenteAte ? 'ok' : 'warn'}>Angellira: {v.vigenteAte ? `vigente até ${fmtDia(v.vigenteAte)}` : (/found/i.test(v.angellira ?? '') ? 'Conforme' : v.angellira)}</DocTag>}
                    </div>
                    {(v.chassi || v.renavam || v.anoFab || v.cor || v.tipo) && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                        {v.tipo && <span>Tipo: <span className="text-foreground">{v.tipo}</span></span>}
                        {v.cor && <span>Cor: <span className="text-foreground">{v.cor}</span></span>}
                        {v.chassi && <span>Chassi: <span className="text-foreground font-mono">{v.chassi}</span></span>}
                        {v.renavam && <span>Renavam: <span className="text-foreground font-mono">{v.renavam}</span></span>}
                        {v.anoFab && <span>Ano: <span className="text-foreground">{v.anoFab}{v.anoModelo && v.anoModelo !== v.anoFab ? `/${v.anoModelo}` : ''}</span></span>}
                        {v.antt && <span>ANTT: <span className="text-foreground">{v.antt}</span></span>}
                        {v.classificacao && <span>Classificação: <span className="text-foreground">{v.classificacao}</span></span>}
                        {v.ultimoLicenciamento && <span>Últ. licenciamento: <span className="text-foreground">{fmtDia(v.ultimoLicenciamento)}</span></span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Sistema Cargas — carga + cadastro do motorista (Angellira) num único bloco */}
            {(cross.carga || (cross.motorista?.cargas && Object.keys(cross.motorista.cargas).length > 0)) && (
              <details className="border-t border-border pt-2">
                <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sistema Cargas — ver tudo</summary>
                {cross.carga && (
                  <div className="mt-1.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Carga</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                      {CARGA_FIELDS.map(([k, label]) => {
                        const v = (cross.carga as Record<string, unknown>)[k]
                        return v != null && v !== '' ? <KV key={k} k={label} v={fmtVal(k, v)} /> : null
                      })}
                    </div>
                  </div>
                )}
                {cross.motorista?.cargas && Object.keys(cross.motorista.cargas).length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Cadastro do motorista (Angellira)</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                      {Object.entries(cross.motorista.cargas).map(([k, v]) => v != null && v !== '' && (
                        <KV key={k} k={labelCarga(k)} v={fmtVal(k, v)} />
                      ))}
                    </div>
                  </div>
                )}
              </details>
            )}
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Linha do tempo — paradas</h4>
          <TripTimeline events={events} onlyStops />
        </div>

        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Comunicações</h4>
          <CommunicationsLog scope={{ tripId: trip.id }} emptyMessage="Sem comunicações registradas para esta viagem." />
        </div>
      </div>

      {/* Ligar motorista */}
      <LogCallDialog scope={{ tripId: trip.id }} open={callOpen} onClose={() => setCallOpen(false)} />

      {/* Adicionar nota */}
      <Dialog open={noteOpen} onOpenChange={(v) => { if (!v) setNoteOpen(false) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar nota — {trip.code}</DialogTitle></DialogHeader>
          <textarea
            className="w-full h-28 rounded-md border border-border bg-background p-2 text-sm"
            placeholder="Nota do operador (vai para a linha do tempo da viagem)…"
            value={noteText} onChange={(e) => setNoteText(e.target.value)}
          />
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setNoteOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={!noteText.trim() || postNote.isPending} onClick={() => postNote.mutate()}>
              {postNote.isPending ? 'Salvando…' : 'Salvar nota'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abrir ocorrência */}
      <Dialog open={occOpen} onOpenChange={(v) => { if (!v) setOccOpen(false) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Abrir ocorrência — {trip.code}</DialogTitle></DialogHeader>
          <input
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
            placeholder="Título da ocorrência…"
            value={occTitle} onChange={(e) => setOccTitle(e.target.value)}
          />
          <select
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
            value={occSeverity} onChange={(e) => setOccSeverity(e.target.value as 'critico' | 'medio' | 'baixo')}
          >
            <option value="critico">Crítica</option>
            <option value="medio">Média</option>
            <option value="baixo">Baixa</option>
          </select>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setOccOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={!occTitle.trim() || postOcc.isPending} onClick={() => postOcc.mutate()}>
              {postOcc.isPending ? 'Abrindo…' : 'Abrir ocorrência'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidePanelLayout>
  )
}

function Metric({ label, value, valueClass }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-medium truncate ${valueClass ?? 'text-foreground'}`}>{value}</p>
    </div>
  )
}

const docToneClass: Record<string, string> = {
  ok:    'bg-success/15 text-success border-success/40',
  warn:  'bg-warning/15 text-warning border-warning/40',
  bad:   'bg-danger/15 text-danger border-danger/40',
  muted: 'bg-muted text-muted-foreground border-border',
}
function DocTag({ tone = 'muted', children }: { tone?: keyof typeof docToneClass; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', docToneClass[tone] ?? docToneClass.muted)}>{children}</span>
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{k}: </span>
      <span className="text-foreground font-medium">{v}</span>
    </div>
  )
}
// Campos da carga (Cargas) a exibir, em ordem, com rótulo pt-BR.
const CARGA_FIELDS: Array<[string, string]> = [
  ['sheet_lh', 'LH'],
  ['status', 'Status (ciclo)'],
  ['sheet_status', 'Status operacional'],
  ['perfil', 'Perfil veículo'],
  ['origem', 'Origem'],
  ['destino', 'Destino'],
  ['data', 'Data'],
  ['horario', 'Horário'],
  ['sheet_data_carregamento', 'Carregamento'],
  ['sheet_data_descarga', 'Descarga'],
  ['distancia_km', 'Distância (km)'],
  ['duracao_horas', 'Duração (h)'],
  ['valor', 'Frete (R$)'],
  ['bonus', 'Bônus (R$)'],
  ['bonus_exigencias', 'Exigências bônus'],
  ['sheet_motorista', 'Motorista'],
  ['sheet_cavalo', 'Cavalo'],
  ['sheet_carreta', 'Carreta'],
  ['sheet_tipo', 'Tipo planilha'],
  ['driver_visibility', 'Visibilidade'],
  ['reserved_at', 'Reservada em'],
  ['reserved_until', 'Reserva até'],
  ['booked_at', 'Confirmada em'],
  ['version', 'Versão'],
  ['sheet_synced_at', 'Sincronizada em'],
  ['created_at', 'Criada em'],
  ['updated_at', 'Atualizada em'],
]

const CARGA_LABELS: Record<string, string> = {
  cpf: 'CPF', nome: 'Nome', cnh: 'CNH', cnh_validade: 'CNH validade', cnh_categoria: 'CNH categoria',
  cnh_security: 'CNH segurança', rg: 'RG', telefone: 'Telefone', nascimento: 'Nascimento',
  driver_kind: 'Vínculo', cidade: 'Cidade', estado: 'UF', angellira_sent_date: 'Angellira enviado',
  angellira_limit_date: 'Angellira vigente até', aspx_found: 'ASPX encontrado', aspx_display_name: 'ASPX nome',
}
function labelCarga(k: string): string { return CARGA_LABELS[k] ?? k }

// Formata valores p/ a tela: dinheiro com milhar, booleano Sim/Não, e QUALQUER data
// (Date, ISO 'YYYY-MM-DD...' ou toString 'Thu Jun 11 2026 ...') vira só dd/MM/yyyy.
function fmtVal(key: string, v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if ((key === 'valor' || key === 'bonus') && !isNaN(Number(v))) return Number(v).toLocaleString('pt-BR')
  const s = String(v)
  // Já em formato BR ('dd/MM/yyyy' com ou sem hora) — mantém como veio (carregamento/descarga têm hora).
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s
  // ISO 'YYYY-MM-DD' — formata direto das partes (sem fuso).
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  // Date object ou toString ('Thu Jun 11 2026 ...') — parseia e formata em UTC (evita -1 dia).
  if (v instanceof Date || /^[A-Z][a-z]{2}\s/.test(s)) {
    const d = new Date(v as string | Date)
    if (!isNaN(d.getTime())) {
      const p = (n: number) => String(n).padStart(2, '0')
      return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
    }
  }
  return s
}

function maskCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`
}
