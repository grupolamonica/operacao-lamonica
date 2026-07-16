/**
 * Tipos da aba SPX / Shopee (Matriz de Operação — Status de Segurança GR).
 * Grão = VIAGEM/escala. Fonte no NOSSO banco:
 *  - cargas.sheet_monitor_snapshot (source='shopee'|'nestle') → matriz (rows_json) + sync
 *  - cargas.sheet_monitor_enriched → perfil Angellira (motorista/cavalo/carreta) + CPF, por lh
 *  - torre.driver_positions → SINAL (última posição conhecida) por placa do cavalo
 *
 * Conformidade com o PainelGR_mapa (planilha de liberação):
 *  - Perfil em 3 dimensões (motorista N / cavalo Q / carreta T): Apto|Vencido por
 *    validade (dias = validade - hoje BRT); "Não encontrado" quando o lookup falha.
 *  - Falha de busca ("-", "#REF!") NÃO é silenciada — vira "Não encontrado" e pendência.
 *  - ESPELHAMENTO AL (col M do doc, data por cavalo, vencido se < hoje): o dado ainda
 *    NÃO chega ao banco (gap de ingestão) — o campo existe e a regra está ligada;
 *    enquanto null, não pesa. "Sinal" (telemetria) é a métrica complementar, informativa.
 */

export type SpxSource = 'shopee' | 'nestle'

export interface SpxSinal {
  /** timestamp ISO da última posição conhecida do cavalo (ou null). */
  lastAt: string | null
  /** ok = posição recente · stale = posição velha · sem_sinal = sem posição. */
  status: 'ok' | 'stale' | 'sem_sinal'
}

/** Uma linha da matriz = uma viagem escalada. */
export interface SpxRow {
  lh: string
  data: string | null // YYYY-MM-DD
  horario: string | null // HH:MM
  tipo: string | null // ForeCast | Spot | Tendência
  /** FROTA | AGREGADO* | PME | TERCEIRO* | PX | JA… — default TERCEIRO (regra do doc). */
  vinculo: string
  motorista: string | null
  cpf: string | null
  cavalo: string | null // placa
  carreta: string | null // placa
  origem: string | null
  destino: string | null
  statusViagem: string | null // CTE ENVIADO | AGUARDANDO... (bruto)

  /** Perfil (Angellira): Apto | Vencido | Não encontrado | texto da fonte | null (sem entidade). */
  perfilMotorista: string | null
  perfilMotoristaDias: number | null
  perfilCavalo: string | null
  perfilCavaloDias: number | null
  perfilCarreta: string | null
  perfilCarretaDias: number | null

  /** Checklist: Aprovado | Reprovado | Vencido | Urgente | Em andamento | Não encontrado | null. */
  checklistCavalo: string | null
  checklistCarreta: string | null
  /** dias de vencimento do checklist — só quando a ingestão carregar (hoje null). */
  checklistCavaloDias: number | null
  checklistCarretaDias: number | null

  /** Espelhamento AL (col M do doc): data + regra vencido se < hoje. GAP de ingestão — null até o dado chegar. */
  espelhamentoAlDate: string | null
  espelhamentoAlVencido: boolean

  /** Sinal (telemetria): última posição conhecida — informativo, não entra na pendência. */
  sinal: SpxSinal

  hasDriver: boolean
  isAvailable: boolean

  /** Override manual do operador (col AA + dropdowns do doc): anotação e/ou liberação com ressalva. */
  override: { liberado: boolean; observacao: string | null; updatedAt: string | null } | null

  /** pendência GR CALCULADA = perfil (3 dimensões) OU checklist não conformes OU espelhamento AL vencido. */
  pendencia: boolean
  /** conforme EFETIVO = sem pendência OU liberado manualmente (com trilha). */
  conforme: boolean
}

export interface SpxOverview {
  source: SpxSource
  date: string // data-base dos KPIs (hoje, BRT)
  escaladosHoje: number
  programadosAmanha: number
  frotasConformes: number
  /** viagens escaladas sem posição de telemetria (sinal). */
  semSinal: number
  naoConforme: number
  lastSyncAt: string | null
}
