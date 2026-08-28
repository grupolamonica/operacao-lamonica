import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Baixa de Manifesto — snapshot do coletor (Sascar + Rodopar), publicado via POST
// no torre e guardado em Redis (T1). A tela só lê, GET atrás do cookie JWT.
//
// v2 (11/08, ver V2-CONTRATO.md): universo passa a ser TODO manifesto aberto
// (~85, não mais só as 4 pendências de baixa). O coletor_v2.py roda em paralelo
// ao coletor.py (v1) até o Danilo aprovar a troca da task — os dois formatos
// podem chegar no mesmo endpoint, por isso TODOS os campos abaixo (dos dois
// formatos) são opcionais e coexistem no mesmo tipo.

export interface Telefone {
  rotulo: string
  numero: string
}

export type EstadoManifesto = 'descarregado' | 'descarregando' | 'aguardando_descarga' | 'em_transito' | 'sem_rastreio'

// Bloco da SM da Angellira (v2) — sinal principal do estado. null quando a
// viagem não tem SM vinculada.
export interface ManifestoSm {
  codigo?: string
  status_viagem?: string
  status_entrega?: string
  cliente?: string
  chegada_local?: string | null
  saida_local?: string | null
  tempo_descarga?: string | null
  atraso?: string | null
  km_faltante?: number | null
  previsao_chegada_local?: string | null
  grade_inicio_local?: string | null
  grade_fim_local?: string | null
}

export interface ManifestoTravaBau {
  estado?: string
  destravou_no_destino_local?: string | null
}

export interface ManifestoMacro {
  ultima?: string
  quando_local?: string | null
  digitado?: string | null
}

// v2 (11/08, furo real): caminhão descarrega e vai embora, mas o manifesto
// continua aberto por morosidade do operador — antes o item voltava pra
// "em trânsito" (saía do radar); agora o coletor mantém o estado com base no
// histórico de permanência no destino. Cada marco é nullable (só existe depois
// que acontece).
export interface ManifestoDestinoHistorico {
  chegou_local?: string | null
  saiu_local?: string | null
  parado_min_descarga_local?: string | null
  macro_fim_no_destino_local?: string | null
}

/**
 * F1 — a referência que o CLIENTE usa para a viagem, vinda de RODCON.ORDCOM.
 * `LT0Q8J02DXVF1` = LH Trip Number do SPX; `B101487201` = grupos_id do Galileu.
 * As guardas dizem se a referência é utilizável como chave (uma só no manifesto,
 * um só manifesto aberto com ela). Nesta fase é apenas exibição.
 */
export interface ManifestoReferenciaCliente {
  valor?: string | null
  formato?: string | null
  qtd_no_manifesto?: number | null
  manifestos_com_a_ref?: number | null
  local_entrega_cte?: string | null
  guardas_erp_ok?: boolean | null
  guardas_reprovadas?: string[] | null
}

export interface PendenciaManifesto {
  // ── v1 ──────────────────────────────────────────────────────────────────
  codlpr?: number
  placa?: string
  estagio?: 'descarregando' | 'descarregado'
  manifestos?: { codman: number; filial: number }[]
  chegada_gmt?: string | null
  chegada_local?: string | null
  fim_gmt?: string | null
  fim_local?: string | null
  idPacote?: string | null
  detectada_em?: string
  // Ficha do painel de detalhes v1 (aditivos/opcionais — coletor antigo não envia)
  viagem?: {
    origem: string
    saida_local: string | null
    previsao_local: string | null
    carreta: string
    motorista2: string
    destino_uf?: string
    motorista_fone?: string
    motorista2_fone?: string
    // cadastro do Rodopar guarda celular e telefone separados (994 motoristas têm
    // os dois diferentes) — o operador escolhe qual chamar
    motorista_fones?: Telefone[]
    motorista2_fones?: Telefone[]
  } | null
  digitado?: string | null
  // selo ⚠: posição no momento da macro não bate com o destino (possível macro por engano)
  posicao_diverge?: boolean
  // como a pendência nasceu: 'macro' (motorista) ou 'gps' (parado no destino, sem macro)
  origem_deteccao?: 'macro' | 'gps'

  // ── comuns aos dois formatos ─────────────────────────────────────────────
  motorista?: string
  cliente?: string
  destino?: string
  // v1: objeto de evidências físicas (fase de observação, não altera estágio)
  // v2: array de códigos que fundamentaram o `estado` (ex.: "sm_entrega_realizada")
  evidencias?: {
    na_cidade_destino: boolean
    cerca_desde_local: string | null
    parado: boolean
    bau_sensor_presente: boolean | null
    bau_ativo: boolean
    bau_ativo_desde_local: string | null
    bau_ativo_sustentado: boolean
    bau_leituras_ativas: number
    bau_transicoes_no_destino: number
    confirmado_por: string[]
  } | string[] | null
  // v1: {lat,lng,cidade,uf,ponto_referencia,distancia_m,quando_local}
  // v2 acrescenta km_destino/parado ao MESMO bloco.
  posicao?: {
    lat?: string | null
    lng?: string | null
    cidade?: string
    uf?: string
    ponto_referencia?: string
    distancia_m?: number | null
    quando_local?: string | null
    km_destino?: number | null
    parado?: boolean
  } | null

  // ── v2 (ver V2-CONTRATO.md) ───────────────────────────────────────────────
  codman?: number
  filial?: number
  serie?: string
  emissao_local?: string | null
  prazo_entrega_local?: string | null
  // false = o DATLME do Rodopar não serve como prazo (nulo, ou <= a emissão): vem herdado
  // de lote, não da viagem, e 21% da base tem esse defeito. Ausente = confiável (v1/antigo).
  prazo_confiavel?: boolean
  horas_aberto?: number
  horas_atraso?: number
  cavalo?: string
  carreta?: string
  motorista_fones?: Telefone[]
  // CODMOT do Rodopar — chave dos telefones que o operador cadastra (ver codmotDaPendencia)
  motorista_codmot?: string | null
  // quando o estado atual começou (wall-clock local): "descarregado há 3 h" e base do tempo até a baixa
  estado_desde_local?: string | null
  destino_uf?: string
  // abas da tela FROTA × DEMAIS (decisão Danilo 11/08 — ver V2-CONTRATO.md)
  na_frota_sascar?: boolean
  comprovacao_trava?: boolean | null
  estado?: EstadoManifesto
  origem_estado?: 'sm' | 'sascar' | 'macro'
  sm?: ManifestoSm | null
  trava_bau?: ManifestoTravaBau | null
  macro?: ManifestoMacro | null
  destino_historico?: ManifestoDestinoHistorico | null
  // F1 — referência que o cliente usa para a viagem (RODCON.ORDCOM), só exibição
  referencia_cliente?: ManifestoReferenciaCliente | null
}

// ── Justificativa do operador (12/08) ──────────────────────────────────────
// Vem do Postgres, NÃO do snapshot: o coletor sobrescreve o snapshot inteiro a cada
// 5 min, então nota gravada nele seria apagada. O GET /pendencias devolve as duas
// coisas juntas (um request só, o polling é de 30s).
export interface TratativaRegistro {
  id: string
  motivo: string
  motivo_rotulo: string
  notes: string | null
  autor: string | null
  criado_em: string
}

export interface ResumoTratativa {
  total: number
  ultima: TratativaRegistro
}

/**
 * Chave do manifesto no formato que a API usa para indexar `tratativas`.
 *
 * ATENÇÃO: é diferente de `chaveManifesto` da BaixaManifestoPage — aquela é chave de
 * UI e precisa cobrir também o formato v1 (codlpr/placa), então leva prefixo. Esta é
 * a chave natural do Rodopar (codman|filial|serie), a mesma do backend. Não unificar:
 * item v1 não tem tratativa, e mudar o prefixo da chave de UI mexeria na seleção da tabela.
 */
export function chaveTratativa(p: PendenciaManifesto): string | null {
  if (p.codman == null || p.filial == null) return null
  // ESPELHA normalizarSerie() do backend (tratativas.service.ts) — trim + corte em 10, o
  // tamanho da coluna. Se as duas divergirem, a nota existe no banco e nunca aparece na tela.
  return `${p.codman}|${p.filial}|${(p.serie ?? '').trim().slice(0, 10)}`
}

// ── Telefones do motorista (13/08) ──────────────────────────────────────────
// Vêm do Postgres, não do snapshot: o Rodopar manda UM número por motorista e é read-only para
// nós. O operador cadastra outros e marca os que não funcionam (que ficam RISCADOS na tela, não
// escondidos — decisão do Danilo). Chaveado pelo CODMOT, então o número segue o motorista.
export interface FoneMotoristaRegistro {
  digitos: string
  numero: string
  rotulo: string
  origem: string
  nao_funciona: boolean
  criado_por: string | null
  criado_em: string
  atualizado_por: string | null
  atualizado_em: string
}

/**
 * CODMOT canônico — ESPELHA normalizarCodmot() de
 * api/src/modules/manifesto/motorista-fones.service.ts. '001234' e '1234' são o mesmo motorista;
 * '' e '0' são inválidos (não existe "motorista sem código").
 */
export function normalizarCodmot(valor?: string | number | null): string {
  const s = String(valor ?? '').trim()
  if (!s) return ''
  const limpo = /^\d+$/.test(s) ? s.replace(/^0+/, '') : s
  if (!limpo || limpo === '0') return ''
  return limpo.slice(0, 20)
}

/** CODMOT do manifesto, ou null quando o snapshot não trouxe (coletor antigo). */
export function codmotDaPendencia(p: PendenciaManifesto): string | null {
  return normalizarCodmot(p.motorista_codmot) || null
}

export interface ManifestoPendenciasSnapshot {
  ok: boolean
  // nulos quando ainda não há snapshot (API acabou de subir, coletor nunca enviou)
  gerado_em: string | null
  recebido_em: string | null
  idade_min: number | null
  total: number
  pendencias: PendenciaManifesto[]
  // mapa chaveTratativa() → resumo; ausente enquanto a API antiga estiver no ar
  tratativas?: Record<string, ResumoTratativa>
  // lista de motivos vem da API para o seletor não divergir do que ela valida
  motivos?: Record<string, string>
  // mapa CODMOT → telefones cadastrados/riscados; ausente na API antiga
  fones_motorista?: Record<string, FoneMotoristaRegistro[]>
  // rótulos oferecidos no seletor, também da API pelo mesmo motivo dos motivos
  rotulos_fone?: readonly string[]
  // última validação por manifesto (chaveTratativa) — a tela marca o que falta validar
  validacoes?: Record<string, ValidacaoRegistro>
  // motivos de erro do sistema, para o seletor não divergir do que a API valida
  motivos_erro?: Record<string, string>
  // último pedido de baixa por manifesto (chaveTratativa) — pinta o botão
  baixa_pedidos?: Record<string, PedidoBaixa>
  // quem está de plantão para executar a fila; null = NINGUÉM (o botão só enfileira)
  agente_fila?: BatidaAgente | null
  // lista inteira (24/08): com uma máquina por operador, "tem robô?" e
  // "quantos robôs?" deixaram de ser a mesma pergunta. Ausente na API antiga.
  agentes_fila?: BatidaAgente[] | null
}

/**
 * Pedido de baixa ao robô. `situacao` governa o botão:
 *
 *   na_fila      → esperando o agente pegar
 *   executando   → robô rodando (Rodopar é sessão única: um por vez no mundo)
 *   concluido    → baixou (o manifesto sai do snapshot no próximo ciclo do coletor)
 *   falhou       → pode pedir de novo
 *   conferencia  → rc 6/11: PODE ter gravado. Uma pessoa tem que olhar o Rodopar.
 *                  Não volta pra fila sozinho e bloqueia pedido novo.
 */
export type SituacaoPedidoBaixa =
  | 'na_fila'
  | 'executando'
  | 'concluido'
  | 'falhou'
  | 'conferencia'
  | 'cancelado'

/**
 * Batida do agente que executa a fila. null = ninguém de plantão.
 *
 * Existe porque um pedido em `na_fila` sem agente rodando parece que está andando e não
 * está — em 21/08 o operador clicou BAIXAR, viu NA FILA e ficou esperando. Vem do Redis
 * com TTL de 10 min, e o agente bate a cada ~15s.
 */
export interface BatidaAgente {
  agente: string
  // Date, não string: ver a nota em PedidoBaixa
  visto_em: string | Date
  // Dono do token que autenticou a máquina. Ausente nas instalações ainda na chave
  // global — e a AUSÊNCIA importa: sem dono não dá para dizer de quem é o robô, então
  // a tela não afirma "o seu está de pé" nem "não está".
  user_id?: string | null
}

export interface PedidoBaixa {
  id: string
  situacao: SituacaoPedidoBaixa
  /**
   * ⚠️ `string | Date` porque o Eden Treaty REVIVE strings ISO com fuso em objetos Date na
   * resposta. A API manda string; o que chega aqui é Date.
   *
   * O tipo antes dizia só `string`, e essa mentira deixou passar um `fmtLocal(criado_em)` que
   * quebrou a tela em produção com "a.match is not a function" (21/08). Formate com
   * `fmtInstante`, nunca com `fmtLocal` — este último é para os campos `*_local` do coletor,
   * que são wall-clock sem fuso e chegam como string de verdade.
   */
  criado_em: string | Date
  autor: string | null
  rc: number | null
  mensagem: string | null
  concluido_em: string | Date | null
  agente: string | null
}

export function useManifestoPendencias() {
  const q = useQuery({
    queryKey: ['manifesto', 'pendencias'],
    queryFn: async (): Promise<ManifestoPendenciasSnapshot> => {
      const { data, error } = await (api.api as any).manifesto.pendencias.get()
      if (error) {
        // Propaga o status para a tela distinguir "sua sessão expirou" (401 — só relogar) de
        // "o sistema falhou" (500). Sem isso as duas mostravam a mesma mensagem, e o operador
        // concluía que o sistema caiu quando bastava fazer login. O AuthGuard só valida a
        // sessão no mount, então cookie que expira com a tela aberta não redireciona ninguém.
        const e = new Error((error.value as any)?.error ?? 'Falha ao ler pendências de manifesto')
        ;(e as Error & { status?: number }).status = (error as { status?: number }).status
        throw e
      }
      return data as ManifestoPendenciasSnapshot
    },
    refetchInterval: 30_000,
  })
  return {
    data: q.data,
    pendencias: q.data?.pendencias ?? [],
    tratativas: q.data?.tratativas ?? {},
    motivos: q.data?.motivos ?? {},
    fonesMotorista: q.data?.fones_motorista ?? {},
    rotulosFone: q.data?.rotulos_fone ?? ['Celular', 'WhatsApp', 'Recado', 'Outro'],
    validacoes: q.data?.validacoes ?? {},
    motivosErro: q.data?.motivos_erro ?? {},
    baixaPedidos: q.data?.baixa_pedidos ?? {},
    agenteFila: q.data?.agente_fila ?? null,
    agentesFila: q.data?.agentes_fila ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
  }
}

export interface NovaTratativaInput {
  codman: number
  filial: number
  serie?: string
  placa?: string
  destino?: string
  motivo: string
  notes?: string
}

/** Registra justificativa (append-only). Invalida o snapshot para o resumo aparecer na tela. */
export function useRegistrarTratativa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: NovaTratativaInput) => {
      const { data, error } = await (api.api as any).manifesto.tratativas.post(vars)
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao registrar justificativa')
      return data as { ok: boolean; tratativa: TratativaRegistro; chave: string }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['manifesto', 'pendencias'] })
      qc.invalidateQueries({ queryKey: ['manifesto', 'tratativas', vars.codman, vars.filial] })
    },
  })
}

/**
 * Cadastra telefone do motorista. Invalida o snapshot — e como o mapa vem do Postgres (não do
 * snapshot do coletor), o número aparece no próximo refetch, sem esperar o ciclo de 5 min.
 */
export function useAdicionarFoneMotorista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      codmot: string
      numero: string
      rotulo?: string
      motorista_nome?: string
    }) => {
      const { data, error } = await (api.api as any).manifesto['motorista-fones'].post(vars)
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao cadastrar telefone')
      return data as { ok: boolean; fone: FoneMotoristaRegistro; ja_existia: boolean }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manifesto', 'pendencias'] }),
  })
}

/** Liga/desliga o "não funciona" (o riscado). Serve inclusive para número vindo do Rodopar. */
export function useMarcarFoneMotorista() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      codmot: string
      numero: string
      nao_funciona: boolean
      rotulo?: string
      motorista_nome?: string
    }) => {
      const { data, error } = await (api.api as any).manifesto['motorista-fones'].marca.put(vars)
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao marcar telefone')
      return data as { ok: boolean; fone: FoneMotoristaRegistro }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manifesto', 'pendencias'] }),
  })
}

// ── Validação do sistema pelo operador (13/08) ──────────────────────────────
// O operador confirma ou nega o que o sistema apontou. Cada validação carrega a FOTO do que a tela
// mostrava (estado, origem do sinal, evidências) — sem isso a acurácia não é calculável depois,
// porque o snapshot é sobrescrito a cada 5 min.
export interface ValidacaoRegistro {
  id: string
  estado_sistema: string
  origem_estado: string | null
  veredito: string
  motivo_erro: string | null
  motivo_erro_rotulo: string | null
  observacao: string | null
  baixado_em: string | null
  autor: string | null
  criado_em: string
  horas_ate_baixa: number | null
}

export interface AcuraciaSistema {
  ok: boolean
  periodo_dias: number
  total: number
  alertas_validados: number
  alertas_corretos: number
  precisao_pct: number | null
  margem_pp: number | null
  falsos_negativos: number
  por_origem: { origem: string; total: number; corretos: number; precisao_pct: number }[]
  por_motivo_erro: { motivo: string; motivo_rotulo: string; total: number }[]
  baixas_declaradas: number
  horas_ate_baixa_media: number | null
  horas_ate_baixa_mediana: number | null
}

export interface NovaValidacaoInput {
  codman: number
  filial: number
  serie?: string
  estado_sistema: string
  origem_estado?: string | null
  evidencias?: string[] | null
  comprovacao_trava?: boolean | null
  na_frota?: boolean | null
  estado_desde?: string | null
  veredito: 'correto' | 'incorreto'
  motivo_erro?: string | null
  observacao?: string
  baixou?: boolean
  placa?: string
  destino?: string
}

/** Registra o veredito do operador. Invalida o snapshot para o item sair da fila de "validar". */
export function useRegistrarValidacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: NovaValidacaoInput) => {
      const { data, error } = await (api.api as any).manifesto.validacoes.post(vars)
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao registrar validação')
      return data as { ok: boolean; validacao: ValidacaoRegistro }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manifesto', 'pendencias'] })
      qc.invalidateQueries({ queryKey: ['manifesto', 'acuracia'] })
    },
  })
}

/** Precisão do alerta medida pelas validações. Só busca quando a seção do relatório está aberta. */
export function useAcuraciaSistema(dias: number, habilitado: boolean) {
  const q = useQuery({
    queryKey: ['manifesto', 'acuracia', dias],
    queryFn: async (): Promise<AcuraciaSistema> => {
      const { data, error } = await (api.api as any).manifesto.validacoes.acuracia.get({
        query: { dias: String(dias) },
      })
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao calcular a acurácia')
      return data as AcuraciaSistema
    },
    enabled: habilitado,
    staleTime: 60_000,
  })
  return { acuracia: q.data, isLoading: q.isLoading, isError: q.isError }
}

// ── Relatório de motivos (13/08) ────────────────────────────────────────────
export interface MotivoAgregado {
  motivo: string
  motivo_rotulo: string
  ativo: boolean
  notas: number
  manifestos: number
}

export interface RelatorioTratativas {
  ok: boolean
  periodo: { inicio: string | null; fim: string | null }
  total_notas: number
  total_manifestos: number
  por_motivo: MotivoAgregado[]
  serie: { dia: string; total: number }[]
  por_destino: { destino: string; notas: number; manifestos: number }[]
  cobertura: {
    snapshot_em: string | null
    idade_min: number | null
    snapshot_ok: boolean
    abertos: number
    vencidos: number
    vencidos_com_justificativa: number
    vencidos_sem_justificativa: number
    cobertura_pct: number
  } | null
}

/**
 * Distribuição de motivos num período. `enabled` só quando a seção está aberta — não faz sentido
 * pesar a tela operacional com um agregado que ninguém está olhando.
 */
export function useRelatorioTratativas(inicio: string, fim: string, habilitado: boolean) {
  const q = useQuery({
    queryKey: ['manifesto', 'relatorio', inicio, fim],
    queryFn: async (): Promise<RelatorioTratativas> => {
      const { data, error } = await (api.api as any).manifesto.tratativas.relatorio.get({
        query: { inicio, fim },
      })
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao montar o relatório')
      return data as RelatorioTratativas
    },
    enabled: habilitado,
    staleTime: 60_000,
  })
  return { relatorio: q.data, isLoading: q.isLoading, isError: q.isError, error: q.error }
}

/** Histórico completo de um manifesto — só busca quando o painel de detalhes está aberto. */
export function useHistoricoTratativas(
  codman: number | null | undefined,
  filial: number | null | undefined,
  serie?: string | null,
) {
  const habilitado = codman != null && filial != null
  const q = useQuery({
    queryKey: ['manifesto', 'tratativas', codman, filial, serie ?? ''],
    queryFn: async () => {
      const { data, error } = await (api.api as any).manifesto
        .tratativas[String(codman)][String(filial)].get({ query: { serie: (serie ?? '').trim() } })
      if (error) throw new Error('Falha ao ler o histórico de justificativas')
      return (data as { tratativas: TratativaRegistro[] }).tratativas
    },
    enabled: habilitado,
    staleTime: 10_000,
  })
  return { historico: q.data ?? [], isLoading: q.isLoading, isError: q.isError }
}

/**
 * Pede a baixa do manifesto ao robô. IRREVERSÍVEL no ERP — a tela confirma antes.
 *
 * 409 não é falha do operador: significa "já existe pedido em andamento", e o motivo pode ser
 * conferência humana pendente. A mensagem da API é repassada crua porque ela é que sabe qual dos
 * dois casos é.
 */
export function usePedirBaixa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      codman: number
      filial: number
      serie?: string
      placa?: string
      destino?: string
      estado_sistema?: string
    }) => {
      const { data, error } = await (api.api as any).manifesto.baixa.pedidos.post(vars)
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao pedir a baixa')
      return data as { ok: boolean; pedido: PedidoBaixa }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manifesto', 'pendencias'] }),
  })
}

/** Libera pedido travado em conferência, DEPOIS de a pessoa conferir no Rodopar. */
export function useLiberarConferencia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { id: string }) => {
      const { data, error } = await (api.api as any).manifesto.baixa.liberar.post(vars)
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao liberar a conferência')
      return data as { ok: boolean; pedido: PedidoBaixa }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manifesto', 'pendencias'] }),
  })
}

// ── Token do agente: liga esta pessoa ao robô do PC dela ──────────────────────
//
// O valor completo existe SÓ na resposta do POST — o servidor guarda apenas o hash.
// Por isso ele não é cacheado nem revalidado: quem perder, gera outro.

export interface TokenAgente {
  id: string
  prefixo: string
  apelido: string | null
  criado_em: string
  usado_em: string | null
}

export function useTokenAgente() {
  return useQuery({
    queryKey: ['manifesto', 'agente-token'],
    queryFn: async () => {
      const { data, error } = await (api.api as any).manifesto.agente.token.get()
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao ler o token')
      return (data as { ok: boolean; token: TokenAgente | null }).token
    },
    staleTime: 60_000,
  })
}

export function useGerarTokenAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { apelido?: string }) => {
      const { data, error } = await (api.api as any).manifesto.agente.token.post(vars)
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao gerar o token')
      return data as { ok: boolean; token: string; prefixo: string; criado_em: string }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manifesto', 'agente-token'] }),
  })
}

export function useRevogarTokenAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await (api.api as any).manifesto.agente.token.delete()
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao revogar o token')
      return data as { ok: boolean }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manifesto', 'agente-token'] }),
  })
}
