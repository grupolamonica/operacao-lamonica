/**
 * Tipos da aba SPX / Shopee (Matriz de Operação — Status de Segurança GR).
 * Grão = VIAGEM/escala. Fonte no NOSSO banco:
 *  - cargas.sheet_monitor_snapshot (source='shopee') → matriz (rows_json) + KPIs (summary_json)
 *  - cargas.sheet_monitor_enriched → perfil Angellira (conforme/vencido) + CPF, por lh
 *  - torre.driver_positions → espelhamento (última posição conhecida) por placa do cavalo
 * Espelhamento é "última posição" (importada), NÃO sinal do rastreador em tempo real.
 */

export interface SpxEspelhamento {
  /** timestamp ISO da última posição conhecida do cavalo (ou null). */
  lastAt: string | null
  /** ok = sinal recente · stale = posição velha · sem_sinal = sem posição. */
  status: 'ok' | 'stale' | 'sem_sinal'
}

/** Uma linha da matriz = uma viagem escalada. */
export interface SpxRow {
  lh: string
  data: string | null // YYYY-MM-DD
  horario: string | null // HH:MM
  tipo: string | null // ForeCast | Spot | Tendência
  vinculo: string | null
  motorista: string | null
  cpf: string | null
  cavalo: string | null // placa
  carreta: string | null // placa
  origem: string | null
  destino: string | null
  statusViagem: string | null // CTE ENVIADO | AGUARDANDO... | etc (bruto)
  perfilCavalo: string | null // Angellira status_text (Conforme/Não Conforme/...)
  perfilCarreta: string | null
  checklistCavalo: string | null // Aprovado | Vencido | Não encontrado | Em andamento
  checklistCarreta: string | null
  /** idade/vencimento do checklist em dias — só quando a ingestão passar a
   *  carregar CMO_DAT_VALIDADE; hoje null (tela é tolerante e mostra sem badge). */
  checklistCavaloDias: number | null
  checklistCarretaDias: number | null
  espelhamento: SpxEspelhamento
  hasDriver: boolean
  isAvailable: boolean
  /** derivados: pendência GR = perfil/checklist não conforme; conforme = sem pendência. */
  pendencia: boolean
  conforme: boolean
}

export interface SpxOverview {
  date: string // data-base dos KPIs (hoje, BRT)
  escaladosHoje: number
  programadosAmanha: number
  frotasConformes: number
  semEspelhamento: number
  naoConforme: number
  lastSyncAt: string | null
}
