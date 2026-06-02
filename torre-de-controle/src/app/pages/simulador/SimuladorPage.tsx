import { useState } from 'react'
import { MapPin, Loader2, Trophy, Zap, DollarSign, Shield, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useSimulateRoutes, type SimRequest, type RouteAlternative } from '@/hooks/useSimulator'
import { useTrips } from '@/hooks/useTrips'

const SP_PRESET: SimRequest = {
  origin:      { lat: -23.4733, lng: -46.5333 }, // CD Guarulhos approx
  destination: { lat: -23.5505, lng: -46.6333 }, // Sé / centro SP
  vehicleType: 'Van',
}

export function SimuladorPage() {
  const [req, setReq] = useState<SimRequest>(SP_PRESET)
  const { data: tripsForPresets } = useTrips({ status: 'in_progress' })
  const sim = useSimulateRoutes()

  function pickFromTrip(t: typeof tripsForPresets[number]) {
    if (!t.originLat || !t.originLng || !t.destLat || !t.destLng) return
    setReq({
      origin:      { lat: Number(t.originLat), lng: Number(t.originLng) },
      destination: { lat: Number(t.destLat),   lng: Number(t.destLng)   },
      vehicleType: req.vehicleType,
    })
  }

  function run() {
    if (sim.isPending) return
    sim.mutate(req)
  }

  const result = sim.data
  const best = result?.alternatives[0]

  return (
    <div className="space-y-5">
      <header className="pb-4">
        <h1 className="text-2xl font-bold text-white">Simulador de Rotas</h1>
        <p className="text-sm text-white/70">Compare alternativas a partir do histórico operacional · distância, tempo, SLA, risco, pedágio</p>
      </header>

      {/* Input panel */}
      <div className="bg-card rounded-lg border border-border shadow-md p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CoordInput
            label="Origem"
            value={req.origin}
            onChange={(o) => setReq({ ...req, origin: o })}
          />
          <CoordInput
            label="Destino"
            value={req.destination}
            onChange={(d) => setReq({ ...req, destination: d })}
          />
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Veículo</p>
            <select
              value={req.vehicleType ?? 'Van'}
              onChange={(e) => setReq({ ...req, vehicleType: e.target.value as SimRequest['vehicleType'] })}
              className="w-full text-sm rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="Van">Van</option>
              <option value="Furgão">Furgão</option>
              <option value="VUC">VUC</option>
            </select>
          </div>
        </div>

        {tripsForPresets && tripsForPresets.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Carregar de uma viagem em andamento</p>
            <div className="flex flex-wrap gap-1.5">
              {tripsForPresets.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickFromTrip(t)}
                  className="text-[11px] px-2 py-1 rounded-full border border-border bg-muted/40 text-foreground hover:bg-accent transition-colors"
                >{t.code} · {t.clientName}</button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={run} disabled={sim.isPending} className="gap-1.5">
            {sim.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Simular alternativas
          </Button>
        </div>
      </div>

      {/* Results */}
      {sim.isError && (
        <p className="text-sm text-danger">Falha ao simular: {(sim.error as Error)?.message}</p>
      )}

      {result && (
        <div className="space-y-4">
          <div className="bg-card rounded-lg border border-border shadow-md p-4 flex items-start gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-info" />
              <span className="text-xs text-foreground">
                Distância mínima teórica (linha reta):
                <strong className="ml-1 tabular-nums">{result.theoreticalMinKm} km</strong>
              </span>
            </div>
            {result.noHistoryMatch && (
              <span className="text-xs text-warning ml-auto">⚠ Sem histórico nessa rota — usando estimativa direta.</span>
            )}
            {best && !result.noHistoryMatch && (
              <span className="text-xs text-muted-foreground ml-auto">
                Melhor alternativa: <strong className="text-foreground">{best.routeCode}</strong> (score {best.score})
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {result.alternatives.map((a, i) => (
              <AlternativeCard key={`${a.routeId ?? 'direto'}-${i}`} alt={a} isWinner={i === 0 && !result.noHistoryMatch} />
            ))}
          </div>

          {/* Comparison table */}
          {result.alternatives.length > 1 && (
            <div className="bg-card rounded-lg border border-border shadow-md overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Comparação lado a lado</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="text-left  px-4 py-2 font-medium">Rota</th>
                      <th className="text-right px-3 py-2 font-medium">Distância</th>
                      <th className="text-right px-3 py-2 font-medium">Tempo</th>
                      <th className="text-right px-3 py-2 font-medium">SLA</th>
                      <th className="text-right px-3 py-2 font-medium">Risco</th>
                      <th className="text-right px-3 py-2 font-medium">Ocorr./viagem</th>
                      <th className="text-right px-3 py-2 font-medium">Pedágio</th>
                      <th className="text-right px-4 py-2 font-medium">Amostras</th>
                      <th className="text-right px-4 py-2 font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.alternatives.map((a, i) => (
                      <tr key={a.routeId ?? `r${i}`} className={cn('hover:bg-accent/30', i === 0 && !result.noHistoryMatch && 'bg-success/5')}>
                        <td className="px-4 py-2 text-foreground">
                          <div className="font-mono text-foreground">{a.routeCode}</div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{a.routeName}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.distanceKm} km</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Math.round(a.durationMin)} min</td>
                        <td className={cn(
                          'px-3 py-2 text-right tabular-nums font-medium',
                          a.slaPct >= 95 ? 'text-success' : a.slaPct >= 85 ? 'text-warning' : 'text-danger',
                        )}>{a.slaPct}%</td>
                        <td className={cn(
                          'px-3 py-2 text-right tabular-nums',
                          a.riskAvg >= 70 ? 'text-danger' : a.riskAvg >= 50 ? 'text-warning' : 'text-foreground',
                        )}>{a.riskAvg}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.alertsPerTrip}</td>
                        <td className="px-3 py-2 text-right tabular-nums">R$ {a.tollEstBRL.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{a.sampleCount}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">{a.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CoordInput({ label, value, onChange }: { label: string; value: { lat: number; lng: number }; onChange: (v: { lat: number; lng: number }) => void }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1"><MapPin className="h-3 w-3" /> {label}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <input
          type="number"
          step="0.0001"
          value={value.lat}
          onChange={(e) => onChange({ ...value, lat: Number(e.target.value) })}
          placeholder="lat"
          className="text-xs font-mono rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          type="number"
          step="0.0001"
          value={value.lng}
          onChange={(e) => onChange({ ...value, lng: Number(e.target.value) })}
          placeholder="lng"
          className="text-xs font-mono rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
    </div>
  )
}

function AlternativeCard({ alt, isWinner }: { alt: RouteAlternative; isWinner: boolean }) {
  return (
    <div className={cn(
      'rounded-lg border shadow-md p-4 space-y-3 relative',
      isWinner ? 'border-success bg-success/5' : 'border-border bg-card',
    )}>
      {isWinner && (
        <div className="absolute -top-2 left-3 inline-flex items-center gap-1 rounded-full bg-success text-white px-2 py-0.5 text-[10px] font-semibold">
          <Trophy className="h-3 w-3" /> Melhor escolha
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-mono font-semibold text-foreground">{alt.routeCode}</p>
          <p className="text-[11px] text-muted-foreground truncate">{alt.routeName}</p>
        </div>
        <div className="flex gap-1">
          {alt.isFastest      && <Tag icon={Zap}        tone="text-info">Mais rápido</Tag>}
          {alt.isCheapest     && <Tag icon={DollarSign} tone="text-success">Mais barato</Tag>}
          {alt.isMostReliable && <Tag icon={Shield}     tone="text-primary">Mais confiável</Tag>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Metric label="Distância" value={`${alt.distanceKm} km`} />
        <Metric label="Tempo" value={`${Math.round(alt.durationMin)} min`} />
        <Metric label="SLA" value={`${alt.slaPct}%`} tone={alt.slaPct >= 95 ? 'text-success' : alt.slaPct >= 85 ? 'text-warning' : 'text-danger'} />
        <Metric label="Risco" value={String(alt.riskAvg)} tone={alt.riskAvg >= 70 ? 'text-danger' : alt.riskAvg >= 50 ? 'text-warning' : 'text-foreground'} />
        <Metric label="Pedágio est." value={`R$ ${alt.tollEstBRL.toFixed(2)}`} />
        <Metric label="Amostras" value={String(alt.sampleCount)} />
      </div>

      <div className="border-t border-border pt-2 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Score composto</span>
        <span className="text-lg font-bold tabular-nums text-foreground">{alt.score}</span>
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn('text-sm font-medium tabular-nums', tone ?? 'text-foreground')}>{value}</p>
    </div>
  )
}

function Tag({ icon: Icon, tone, children }: { icon: typeof Trophy; tone: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium', tone)}>
      <Icon className="h-2.5 w-2.5" /> {children}
    </span>
  )
}
