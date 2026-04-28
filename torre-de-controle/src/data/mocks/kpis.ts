import type {
  KPIDashboard, KPITorre, KPIViagens, KPIMotoristas, KPIAlertas,
} from '@/data/types'

export const kpisDashboard: KPIDashboard = {
  entregas:             { onTime: 77, total: 83, pct: 92.6 },
  sla:                  { pct: 92.6, meta: 95 },
  motoristasEmRisco:    { count: 4, total: 25, sparkline: [2, 3, 2, 4, 5, 3, 4] },
  atrasosCriticos:      { count: 2, total: 83, sparkline: [1, 0, 2, 3, 1, 2, 2] },
  paradasNaoPlanejadas: { count: 6, total: 83, sparkline: [3, 5, 4, 6, 7, 5, 6] },
}

export const kpisTorre: KPITorre = {
  viagensAtivas:    { count: 8, total: 83 },
  emRisco:          { count: 2, total: 8 },
  atrasosCriticos:  { count: 1, total: 8 },
  semSinal:         { count: 1, total: 8 },
  ocorrencias:      { criticas: 5, medias: 6 },
}

export const kpisViagens: KPIViagens = {
  total:           { count: 283 },
  noPrazo:         { count: 235, pct: 83.0 },
  emRisco:         { count: 28, pct: 9.9 },
  atrasadas:       { count: 20, pct: 7.1 },
  progressoMedio:  { pct: 64 },
}

export const kpisMotoristas: KPIMotoristas = {
  ativos:             { count: 25, total: 32 },
  disponiveis:        { count: 6 },
  emRota:             { count: 7 },
  comAtraso:          { count: 4 },
  documentosVencendo: { count: 3 },
}

export const kpisAlertas: KPIAlertas = {
  criticos:        { count: 5 },
  abertos:         { count: 12 },
  resolvidosHoje:  { count: 8 },
  slaTratativas:   { pct: 91 },
}
