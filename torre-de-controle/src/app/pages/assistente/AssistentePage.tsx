import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Loader2, User2, AlertTriangle, Truck, BarChart3, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAssistantAsk, useAssistantSuggestions, type AssistantResponse, type AssistantData } from '@/hooks/useAssistant'
import { formatTime } from '@/lib/formatters'

interface ChatTurn {
  id:        string
  question:  string
  response?: AssistantResponse
  error?:    string
}

export function AssistentePage() {
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const { data: suggestions } = useAssistantSuggestions()
  const ask = useAssistantAsk()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  function submit(q: string) {
    const text = q.trim()
    if (!text || ask.isPending) return
    const id = String(Date.now())
    setTurns((cur) => [...cur, { id, question: text }])
    setInput('')
    ask.mutate(text, {
      onSuccess: (response) => setTurns((cur) => cur.map((t) => (t.id === id ? { ...t, response } : t))),
      onError: (err) => setTurns((cur) => cur.map((t) => (t.id === id ? { ...t, error: (err as Error).message } : t))),
    })
  }

  return (
    <div className="space-y-5">
      <header className="pb-4">
        <h1 className="text-2xl font-bold text-white">Assistente Operacional</h1>
        <p className="text-sm text-white/70">Pergunte em linguagem natural sobre a operação — viagens, SLA, motoristas, regiões, previsões.</p>
      </header>

      <div className="bg-card rounded-lg border border-border shadow-md overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: 500 }}>
        {/* Conversation area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {turns.length === 0 && (
            <div className="text-center py-10">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Em que posso ajudar?</p>
              <p className="text-xs text-muted-foreground">Use a barra abaixo ou escolha uma sugestão.</p>

              {suggestions && suggestions.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 mt-5 max-w-2xl mx-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/40 text-foreground hover:bg-accent transition-colors"
                    >{s}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {turns.map((t) => (
            <div key={t.id} className="space-y-3">
              {/* User question */}
              <div className="flex gap-2 justify-end">
                <div className="rounded-lg bg-primary text-primary-foreground px-3 py-2 max-w-[80%] text-sm">
                  {t.question}
                </div>
                <div className="h-7 w-7 shrink-0 rounded-full bg-primary/15 flex items-center justify-center">
                  <User2 className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>

              {/* Assistant answer */}
              {!t.response && !t.error && (
                <div className="flex gap-2">
                  <AssistantAvatar />
                  <div className="rounded-lg bg-muted px-3 py-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Consultando dados...
                  </div>
                </div>
              )}
              {t.error && (
                <div className="flex gap-2">
                  <AssistantAvatar />
                  <div className="rounded-lg bg-danger/10 text-danger px-3 py-2 text-xs">{t.error}</div>
                </div>
              )}
              {t.response && (
                <div className="flex gap-2">
                  <AssistantAvatar />
                  <div className="rounded-lg bg-muted px-3 py-2 max-w-[80%] text-sm space-y-2">
                    <p className="text-foreground whitespace-pre-wrap">{t.response.answer}</p>
                    {t.response.data && <DataCard data={t.response.data} />}
                    {t.response.intent && t.response.intent !== 'unknown' && (
                      <p className="text-[10px] text-muted-foreground italic">
                        intent: {t.response.intent} · conf. {Math.round(t.response.confidence * 100)}%
                      </p>
                    )}
                    {t.response.intent === 'unknown' && t.response.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {t.response.suggestions.slice(0, 4).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => submit(s)}
                            className="text-[11px] px-2 py-1 rounded-full border border-border bg-card hover:bg-accent transition-colors"
                          >{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-border bg-muted/30 px-4 py-3">
          <form onSubmit={(e) => { e.preventDefault(); submit(input) }} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre viagens, SLA, motoristas, regiões..."
              className="flex-1 text-sm rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
              disabled={ask.isPending}
            />
            <Button size="sm" type="submit" disabled={!input.trim() || ask.isPending} className="gap-1.5">
              {ask.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

function AssistantAvatar() {
  return (
    <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-primary to-info flex items-center justify-center">
      <Sparkles className="h-3.5 w-3.5 text-white" />
    </div>
  )
}

function DataCard({ data }: { data: AssistantData }) {
  if (data.kind === 'kpi') {
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2 inline-block">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{data.metric}</p>
        <p className="text-2xl font-bold tabular-nums text-foreground">{data.value}</p>
        {data.subtitle && <p className="text-[11px] text-muted-foreground">{data.subtitle}</p>}
      </div>
    )
  }
  if (data.kind === 'trips') {
    return (
      <ul className="space-y-1 mt-1">
        {data.rows.slice(0, 6).map((r) => (
          <li key={r.code} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
            <Truck className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-mono text-foreground">{r.code}</span>
            <span className="text-muted-foreground truncate flex-1">{r.clientName}</span>
            {r.riskLevel && <span className={cn(
              'text-[10px] px-1.5 py-0 rounded-full font-medium',
              r.riskLevel === 'critico' ? 'bg-danger/15 text-danger' : r.riskLevel === 'alto' ? 'bg-orange-500/15 text-orange-500' : 'bg-warning/15 text-warning',
            )}>{r.riskLevel}</span>}
            {r.eta && <span className="text-[10px] text-muted-foreground tabular-nums">{formatTime(r.eta)}</span>}
          </li>
        ))}
      </ul>
    )
  }
  if (data.kind === 'alerts') {
    return (
      <ul className="space-y-1 mt-1">
        {data.rows.slice(0, 6).map((a) => (
          <li key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
            <AlertTriangle className="h-3 w-3 text-danger shrink-0" />
            <span className="text-foreground truncate flex-1">{a.title}</span>
            <span className="text-[10px] text-muted-foreground capitalize">{a.status.replace('_', ' ')}</span>
          </li>
        ))}
      </ul>
    )
  }
  if (data.kind === 'breakdown') {
    return (
      <table className="w-full text-xs mt-1 border border-border rounded-md overflow-hidden">
        <thead className="bg-muted/40">
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="text-left px-3 py-1.5 font-medium">Item</th>
            <th className="text-right px-3 py-1.5 font-medium">{data.primaryLabel}</th>
            {data.secondaryLabel && <th className="text-right px-3 py-1.5 font-medium">{data.secondaryLabel}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.rows.slice(0, 8).map((r, i) => (
            <tr key={`${r.label}-${i}`} className="bg-card">
              <td className="px-3 py-1.5 text-foreground">{r.label}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{r.primary}{r.pct != null ? '%' : ''}</td>
              {data.secondaryLabel && <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{r.secondary}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (data.kind === 'forecast') {
    return (
      <div className="flex items-center gap-3 mt-1 rounded-md border border-border bg-card px-3 py-2">
        <BarChart3 className="h-5 w-5 text-info" />
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">{data.total7d}</p>
          <p className="text-[11px] text-muted-foreground">entregas previstas · tendência <span className="inline-flex items-center gap-0.5"><TrendingUp className="h-2.5 w-2.5" />{data.trend}</span></p>
        </div>
      </div>
    )
  }
  return null
}
