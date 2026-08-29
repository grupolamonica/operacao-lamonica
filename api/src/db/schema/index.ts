export * from './users'
export * from './clients'
export * from './routes'
export * from './drivers'
export * from './driver-documents'
export * from './vehicles'
export * from './trips'
export * from './trip-events'
export * from './trip-daily-km'
export * from './alerts'
export * from './treatments'
export * from './geofences'
export * from './sla-rules'
export * from './communications'
// Phase 6 / Wave 0 — Insights+Polish+Deploy auxiliary tables
export * from './push-subscriptions'
export * from './alert-thresholds'
export * from './gps-providers'
// Phase 10 — Importação Viagens.xlsx / Ingestão posições motoristas
export * from './driver-positions'
export * from './geocode-cache'
// Phase 14 — cache de cargas em aberto + candidatos (sync do Cargas)
export * from './cargas'
// GR — cache das vigências de risco (Angellira/BRK/SPX) por entidade
export * from './gr'
// Phase 15 — cruzamento SPX (line_haul trips) x Angellira (risco) por viagem
export * from './spx-trip-check'
// Credenciais das integrações (Angellira/aspx) — rotação de senha via banco
export * from './integration-credentials'
// Justificativa do operador na baixa de manifesto (append-only; snapshot é volátil no Redis)
export * from './manifesto-tratativas'
// Telefones do motorista gerenciados pelo operador (override lateral; o Rodopar é read-only)
export * from './manifesto-motorista-fones'
// Validação do sistema pelo operador — mede a precisão do alerta (carrega a foto do momento)
export * from './manifesto-validacoes'

// Fila de pedidos de baixa: o operador aperta o botão, o robô executa. Também é a
// memória compartilhada de "Efetuar clicado e não confirmado", que hoje está partida
// entre os %LOCALAPPDATA% das máquinas dos operadores.
export * from './manifesto-baixa-pedidos'
export * from './manifesto-baixa-auto'
export * from './relations'
export * from './manifesto-agente-tokens'
