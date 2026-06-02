// Intent classifier. Pure: takes a question string, returns the best-matching
// intent + extracted params + a 0..1 confidence. No DB, no IO.
//
// This is deliberately a deterministic NL→intent layer (regex + keyword match)
// instead of a hosted LLM call. Pros: zero cost, instant, deterministic, no
// data leaves the box. Cons: only understands phrasings we anticipated.
//
// Future hook: assistant.service can fall back to Claude API for unmatched
// questions when ANTHROPIC_API_KEY is set — see service comment.

export type IntentId =
  | 'trips_at_risk'
  | 'critical_alerts'
  | 'drivers_with_delays'
  | 'clients_impacting_sla'
  | 'sla_today'
  | 'demand_forecast'
  | 'critical_regions'
  | 'top_problematic_routes'
  | 'open_occurrences_count'
  | 'fleet_position'
  | 'unknown'

export interface IntentMatch {
  intent:     IntentId
  confidence: number  // 0..1
  params:     Record<string, string | number | undefined>
  matched:    string  // the phrase that triggered the match (for debug/UI)
}

// Lowercase + strip accents so the matcher doesn't care about "ocorrências" vs "ocorrencias".
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

interface Rule {
  intent:     IntentId
  patterns:   RegExp[]
  params?:    (q: string) => Record<string, string | number | undefined>
  weight?:    number   // tiebreaker; default 1
}

const RULES: Rule[] = [
  {
    intent: 'trips_at_risk',
    patterns: [
      /viagens?\s+(em\s+)?risco/,
      /entregas?\s+(em\s+)?risco/,
      /quais.*risco.*(hoje|agora)/,
      /(alto|critico).*viagens?/,
    ],
  },
  {
    intent: 'critical_alerts',
    patterns: [
      /(ocorrencias?|alertas?)\s+criticas?/,
      /criticas?\s+abertas?/,
      /(ocorrencias?|alertas?)\s+(abertas?|em\s+aberto)/,
    ],
  },
  {
    intent: 'drivers_with_delays',
    patterns: [
      /motoristas?.*(atrasos?|mais.*atrasaram|com.*atrasos?)/,
      /quem.*atrasou/,
      /(piores?|pior)\s+motoristas?/,
    ],
  },
  {
    intent: 'clients_impacting_sla',
    patterns: [
      /(qual|quais)?\s*clientes?.*(impact|prejudic|afeta|pior|cai).*sla/,
      /sla.*por.*cliente/,
      /clientes?.*sla.*(baix|pior|ruim)/,
    ],
  },
  {
    intent: 'sla_today',
    patterns: [
      /sla.*(hoje|atual|agora)/,
      /como.*sla.*hoje/,
      /percentual.*prazo/,
    ],
  },
  {
    intent: 'demand_forecast',
    patterns: [
      /(quantas?|previs).*entregas?.*(semana|7\s*dias|proxim)/,
      /demanda.*(futura|prox|7\s*dias|semana)/,
      /(quanto|qual).*entregas?.*esperad/,
    ],
  },
  {
    intent: 'critical_regions',
    patterns: [
      /regi(oe|a)?\s*(criticas?|risco|problema|atencao)/,
      /quais.*regioes?.*(piores?|criticas?|risco)/,
      /bases?\s+criticas?/,
    ],
  },
  {
    intent: 'top_problematic_routes',
    patterns: [
      /rotas?.*(problematicas?|pior|piores)/,
      /quais.*rotas?.*(atras|problema|risco)/,
    ],
  },
  {
    intent: 'open_occurrences_count',
    patterns: [
      /quantas?.*(ocorrencias?|alertas?).*(abertas?|aberto)/,
      /(ocorrencias?|alertas?).*total.*hoje/,
    ],
  },
  {
    intent: 'fleet_position',
    patterns: [
      /(onde|posicao).*frota/,
      /(motoristas?|veiculos?)\s+ativos/,
      /quantos?.*ativ/,
    ],
  },
]

export function classifyIntent(question: string): IntentMatch {
  const q = normalize(question.trim())
  if (!q) return { intent: 'unknown', confidence: 0, params: {}, matched: '' }

  let best: IntentMatch = { intent: 'unknown', confidence: 0, params: {}, matched: '' }
  for (const r of RULES) {
    for (const p of r.patterns) {
      const m = q.match(p)
      if (!m) continue
      // Confidence: longer matches + earlier in the string are stronger
      const span = m[0].length
      const earlyBonus = m.index === undefined ? 0 : Math.max(0, 1 - (m.index / q.length))
      const conf = Math.min(1, 0.4 + 0.5 * (span / q.length) + 0.1 * earlyBonus) * (r.weight ?? 1)
      if (conf > best.confidence) {
        best = {
          intent:     r.intent,
          confidence: Number(conf.toFixed(2)),
          params:     r.params?.(q) ?? {},
          matched:    m[0],
        }
      }
    }
  }
  return best
}

// Suggested questions surfaced when the user opens the assistant blank.
export const SUGGESTED_QUESTIONS: string[] = [
  'Quais viagens estão em risco agora?',
  'Quais motoristas tiveram mais atrasos?',
  'Qual cliente está impactando mais o nosso SLA?',
  'Quantas ocorrências críticas abertas?',
  'Como está o SLA hoje?',
  'Quantas entregas previstas na próxima semana?',
  'Quais regiões estão mais críticas?',
  'Quais rotas mais problemáticas?',
]
