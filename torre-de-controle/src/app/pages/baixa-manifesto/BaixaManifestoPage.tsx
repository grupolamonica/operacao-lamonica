import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { BookOpen, Bot, MessageSquare, PackageCheck, Phone, Volume2, VolumeX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AUTO_CHIP, ESTADOS, ESTADO_INFO, JA_SAIU_CHIP, SEM_PRAZO_CHIP, TRAVA_CHIP } from './chips'
import { PanelCard } from '@/components/domain/PanelCard'
import { RelatorioMotivos } from './components/RelatorioMotivos'
import { ValidacaoSecao } from './components/ValidacaoSecao'
import { TokenDoAgente } from './components/TokenDoAgente'
import { DiscadorNet2phoneProvider, useDiscador } from './components/DiscadorNet2phone'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { FixedPanel } from '@/components/domain/FixedPanel'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  chaveTratativa,
  codmotDaPendencia,
  useAdicionarFoneMotorista,
  useHistoricoTratativas,
  useManifestoPendencias,
  useLiberarConferencia,
  useMarcarFoneMotorista,
  usePedirBaixa,
  useRegistrarTratativa,
  type EstadoManifesto,
  type FoneMotoristaRegistro,
  type PendenciaManifesto,
  type BatidaAgente,
  type PedidoBaixa,
  type ResumoTratativa,
  type Telefone,
  type ValidacaoRegistro,
  usePostoAutomacao,
  useExecutarAgora,
} from '@/hooks/useManifestoPendencias'
import { useNow } from '@/hooks/useNow'
import { useAuthStore } from '@/stores/useAuthStore'
import { formatDuration } from '@/lib/formatters'
import { digitosFone, foneValido, telHref } from '@/lib/telefone'
import { unlockAudio, beep, speak, primeSpeech } from '@/lib/audioAlert'

/**
 * Baixa de Manifesto — v2 (11/08, ver V2-CONTRATO.md).
 *
 * Universo passa de "4 pendências de baixa" para TODO manifesto aberto (~85):
 * a SM da Angellira é o sinal principal do `estado`, Sascar/macro é reforço e
 * plano B. O coletor_v2.py roda em paralelo ao coletor.py (v1) até o Danilo
 * aprovar a troca da task — por isso esta tela precisa renderizar os dois
 * formatos sem quebrar (ver deriveEstado/estagio abaixo).
 *
 *   • Duas abas (decisão Danilo 11/08): FROTA (`na_frota_sascar`, tem SM +
 *     posição + trava do baú + macro) × DEMAIS (agregados/terceiros, só SM).
 *     KPIs/filtro/tabela operam dentro da aba selecionada; o som (abaixo) é
 *     independente da aba.
 *   • KPIs por estado + "prazo vencido"
 *   • Filtro rápido por estado + toggle "só prazo vencido" (85 itens é demais
 *     para rolar sem filtro)
 *   • Tabela ordenada pelo contrato: descarregado (maior atraso) → descarregando
 *     → aguardando_descarga → em_transito com prazo vencido → resto por horas_aberto
 *   • Som (reusa src/lib/audioAlert.ts): SÓ quando um manifesto ENTRA em
 *     `descarregado` — demais transições silenciosas (85 itens, som só no que
 *     exige ação)
 */

const ORIGEM_LABEL: Record<'sm' | 'sascar' | 'macro', string> = { sm: 'SM', sascar: 'GPS', macro: 'MACRO' }

// v1 não manda `estado` — deriva do `estagio` antigo (compatibilidade, ver TAREFA 2).
function deriveEstado(p: PendenciaManifesto): EstadoManifesto {
  if (p.estado) return p.estado
  if (p.estagio === 'descarregado') return 'descarregado'
  if (p.estagio === 'descarregando') return 'descarregando'
  return 'sem_rastreio'
}

function vencido(p: PendenciaManifesto): boolean {
  return (p.horas_atraso ?? 0) > 0
}

// O DATLME do Rodopar vem herdado de lote, não da viagem: em 21% da base (4.789 de
// 23.021 em 12 meses, medido 17/08) ele é <= a emissão, e o manifesto NASCIA vencido —
// 18 dos 63 "atrasados" da tela eram falsos, e como a lista ordena por horas_atraso o
// lixo (339 h, 336 h...) liderava. O coletor agora zera o atraso nesses casos; aqui a
// tela precisa dizer que NÃO SABE o prazo, porque exibir "no prazo" seria tão mentiroso
// quanto o "vencido" que isto corrige. Ausente = confiável (snapshot v1/antigo).
function prazoConfiavel(p: PendenciaManifesto): boolean {
  return p.prazo_confiavel !== false
}

// FROTA × DEMAIS (decisão Danilo 11/08, ver V2-CONTRATO.md): FROTA tem
// rastreador Sascar nosso (SM + posição + trava do baú + macro); DEMAIS são
// agregados/terceiros — só a SM. Snapshot antigo sem o campo: aproxima pela
// presença de posição (era o universo único de antes das abas).
function naFrota(p: PendenciaManifesto): boolean {
  if (p.na_frota_sascar != null) return p.na_frota_sascar
  return p.posicao != null
}

// Furo real (11/08): caminhão chega no cliente, descarrega, fecha o baú e vai
// embora — mas o manifesto continua aberto por morosidade do operador. Antes o
// sistema devolvia o item pra "em trânsito" (saía do radar); agora o coletor
// mantém o estado com base no histórico do destino (`destino_historico`) e esse
// caso precisa saltar aos olhos do operador.
function jaSaiuDoCliente(p: PendenciaManifesto): boolean {
  const estado = deriveEstado(p)
  return !!p.destino_historico?.saiu_local && (estado === 'descarregado' || estado === 'descarregando')
}

// *_local é literal "wall-clock" (já em horário local) — nunca reinterpretar via
// `new Date(str)` (o fuso do navegador pode não bater com o do servidor). Extrai
// os componentes por regex e reformata dd/MM/yyyy HH:mm sem tocar no relógio.
function fmtLocal(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return iso
  const [, y, mo, d, h, mi] = m
  return `${d}/${mo}/${y} ${h}:${mi}`
}

// Tempo decorrido (compat v1) é calculado por *_gmt (UTC, sem sufixo 'Z' no
// payload) — anexa o 'Z' antes de criar o Date para não reinterpretar como
// horário local do navegador.
/**
 * Formata um INSTANTE vindo do Postgres (timestamptz), como os campos do pedido de baixa.
 *
 * NÃO é o mesmo que `fmtLocal`, e a diferença é semântica, não de estilo: `fmtLocal` serve
 * aos campos `*_local` do coletor, que são wall-clock SEM fuso e por isso jamais devem
 * passar por `new Date()`. Aqui é o oposto — o valor é um instante real, com fuso, e
 * converter para o relógio de quem olha é exatamente o certo.
 *
 * ⚠️ Aceita `Date` além de string porque o Eden Treaty REVIVE strings ISO com fuso em
 * objetos Date na resposta. Foi assim que `fmtLocal(pedido.criado_em)` estourou em produção
 * com "a.match is not a function" (21/08): o campo chega como Date, não string, e o código
 * antigo nunca tropeçou nisso porque formatava com `new Date(...)`, que aceita os dois.
 */
function fmtInstante(v: string | Date | null | undefined): string {
  if (!v) return '—'
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d.getTime())) return String(v)
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function parseGmt(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(`${iso}Z`)
  return isNaN(d.getTime()) ? null : d
}

function elapsedMinutesV1(p: PendenciaManifesto, now: Date): number | null {
  const base = parseGmt(p.fim_gmt) ?? parseGmt(p.chegada_gmt)
  if (!base) return null
  return Math.max(0, Math.round((now.getTime() - base.getTime()) / 60_000))
}

// "Aberto há" — v2 manda horas_aberto pronto; v1 não tem o campo, aproxima a
// partir de chegada/fim (mesma conta que a tela v1 já fazia).
function horasAbertoDe(p: PendenciaManifesto, now: Date): number | null {
  if (p.horas_aberto != null) return p.horas_aberto
  const min = elapsedMinutesV1(p, now)
  return min == null ? null : min / 60
}

// quando_local (Sascar) é literal wall-clock — constrói o Date a partir dos
// MESMOS componentes no relógio local do navegador (sem `new Date(str)` direto,
// que reinterpretaria pelo fuso do navegador) para poder subtrair de `now`.
function minutesSinceLocal(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const base = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? '0'))
  return Math.max(0, Math.round((now.getTime() - base.getTime()) / 60_000))
}

// Rótulo do manifesto: v2 é um único codman+filial; v1 tem uma lista `manifestos[]`.
function manifestoLabel(p: PendenciaManifesto): string {
  if (p.codman != null) return String(p.codman)
  if (p.manifestos?.length) return p.manifestos.map((m) => m.codman).join(', ')
  return '—'
}

// Chave estável do manifesto (independe do estado) — usada para detectar
// transição de estado (chave = `${chaveManifesto(p)}|${estado}`).
function chaveManifesto(p: PendenciaManifesto): string {
  if (p.codman != null) return `codman:${p.codman}|${p.filial ?? ''}|${p.serie ?? ''}`
  if (p.codlpr != null) return `codlpr:${p.codlpr}`
  return `placa:${p.placa ?? ''}`
}

// Cavalo (v2) com fallback pra placa (v1) — mesma coisa, nome de campo mudou.
function cavaloDe(p: PendenciaManifesto): string {
  return p.cavalo || p.placa || '—'
}
function carretaDe(p: PendenciaManifesto): string {
  return p.carreta || p.viagem?.carreta || '—'
}

// Km até o destino: km_faltante da SM é a fonte mais confiável (Angellira);
// km_destino da última posição Sascar é o plano B.
function kmDestinoDe(p: PendenciaManifesto): number | null {
  return p.sm?.km_faltante ?? p.posicao?.km_destino ?? null
}
function fmtKm(km: number | null): string {
  return km == null ? '—' : `${km.toFixed(1)} km`
}

// Distância Sascar (ponto de referência, v1) chega em metros.
function fmtDistancia(m: number | null | undefined): string {
  if (m == null) return '—'
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m)} m`
}

// Um número na tela, já resolvido: veio do Rodopar ou foi cadastrado, e está ou não riscado.
export interface FoneExibicao {
  digitos: string
  numero: string
  rotulo: string
  origem: 'rodopar' | 'operador'
  naoFunciona: boolean
  marcadoPor: string | null
  marcadoEm: string | null
}

export interface ContatoMotorista {
  nome: string
  codmot: string | null
  fones: FoneExibicao[]
}

/**
 * Contatos de uma pendência, mesclando o snapshot (Rodopar) com o que o operador cadastrou/riscou.
 *
 * v2 manda `motorista_fones` no topo (um motorista); v1 manda dentro de `viagem` (até dois).
 * A marca de "não funciona" mora na NOSSA tabela e é cruzada aqui por dígitos — inclusive para
 * número que veio do Rodopar, onde não escrevemos.
 *
 * ⚠️ O ramo v2 dispara também quando existe apenas `codmot` sem nenhum telefone: motorista sem
 * número no Rodopar é justamente o caso em que o operador MAIS precisa cadastrar.
 */
function contatosDaPendencia(
  p: PendenciaManifesto,
  fonesMotorista: Record<string, FoneMotoristaRegistro[]> = {},
): ContatoMotorista[] {
  const codmot = codmotDaPendencia(p)

  if (p.motorista_fones?.length || codmot) {
    const porDigitos = new Map<string, FoneExibicao>()
    for (const f of p.motorista_fones ?? []) {
      const d = digitosFone(f.numero)
      porDigitos.set(d, {
        digitos: d, numero: f.numero, rotulo: f.rotulo,
        origem: 'rodopar', naoFunciona: false, marcadoPor: null, marcadoEm: null,
      })
    }
    for (const r of (codmot ? fonesMotorista[codmot] : undefined) ?? []) {
      const existente = porDigitos.get(r.digitos)
      if (existente) {
        // mesmo número do Rodopar: nossa linha só aplica a marca, sem duplicar
        existente.naoFunciona = r.nao_funciona
        existente.marcadoPor = r.atualizado_por
        existente.marcadoEm = r.atualizado_em
      } else if (r.origem === 'operador') {
        porDigitos.set(r.digitos, {
          digitos: r.digitos, numero: r.numero, rotulo: r.rotulo,
          origem: 'operador', naoFunciona: r.nao_funciona,
          marcadoPor: r.atualizado_por, marcadoEm: r.atualizado_em,
        })
      }
      // linha 'rodopar' cujo número saiu do snapshot (cadastro mudou): não exibe — o número
      // não é mais o do motorista, e mostrá-lo confundiria quem vai ligar
    }
    return [{ nome: p.motorista || '—', codmot, fones: [...porDigitos.values()] }]
  }

  // ── v1: sem codmot e sem motorista_fones, preserva o formato antigo (sem escrita) ──
  const legado = (fone?: string): FoneExibicao[] =>
    fone
      ? [{
          digitos: digitosFone(fone), numero: fone, rotulo: 'Telefone',
          origem: 'rodopar', naoFunciona: false, marcadoPor: null, marcadoEm: null,
        }]
      : []
  const daLista = (fones?: Telefone[]): FoneExibicao[] =>
    (fones ?? []).map((f) => ({
      digitos: digitosFone(f.numero), numero: f.numero, rotulo: f.rotulo,
      origem: 'rodopar' as const, naoFunciona: false, marcadoPor: null, marcadoEm: null,
    }))
  return [
    {
      nome: p.motorista ?? '', codmot: null,
      fones: p.viagem?.motorista_fones ? daLista(p.viagem.motorista_fones) : legado(p.viagem?.motorista_fone),
    },
    {
      nome: p.viagem?.motorista2 ?? '', codmot: null,
      fones: p.viagem?.motorista2_fones ? daLista(p.viagem.motorista2_fones) : legado(p.viagem?.motorista2_fone),
    },
  ].filter((c) => c.nome && c.fones.length > 0)
}

// Dois beeps em sequência (🔴 entrou em descarregado) — aguarda o 1º terminar antes do 2º.
async function beepUrgente() {
  await beep(1175)
  await new Promise((r) => setTimeout(r, 150))
  await beep(1175)
}

// Ordenação do contrato (V2-CONTRATO.md): descarregado (maior atraso primeiro)
// → descarregando → aguardando_descarga → em_transito com prazo vencido →
// resto por horas_aberto (usado também como critério de desempate dos grupos acima).
function rankEstado(p: PendenciaManifesto): number {
  const estado = deriveEstado(p)
  if (estado === 'descarregado') return 0
  if (estado === 'descarregando') return 1
  if (estado === 'aguardando_descarga') return 2
  if (estado === 'em_transito' && vencido(p)) return 3
  return 4
}

/**
 * O provider envolve a tela porque o widget do discador (iframe do net2phone) precisa viver ACIMA
 * do conteúdo e permanecer montado: é nele que o operador faz login e desliga a chamada, e o SDK
 * não expõe hangup por código. Desmontar durante uma ligação a mataria.
 */
export function BaixaManifestoPage() {
  return (
    <DiscadorNet2phoneProvider>
      <BaixaManifestoConteudo />
    </DiscadorNet2phoneProvider>
  )
}

//: Situação do pedido em português, para a tela não mostrar o enum cru.
const ROTULO_SITUACAO_PEDIDO: Record<string, string> = {
  na_fila: 'Na fila',
  executando: 'Executando agora',
  concluido: 'Baixado',
  falhou: 'Falhou — pode pedir de novo',
  conferencia: 'Aguardando conferência humana',
  cancelado: 'Cancelado',
}

/**
 * Como o botão de baixa se apresenta, por situação do pedido.
 *
 * `conferencia` é o único que NÃO oferece "pedir de novo": rc 6/11 do robô querem dizer que o
 * Efetuar pode ter sido clicado e o banco do Rodopar não confirmou — e o banco não distingue
 * "intocado" de "clicado e não processado". Repetir às cegas duplica lançamento. Ver
 * docs/CONVENCAO-ROBO.md §3 no repo robo-baixa-manifesto.
 */
/**
 * O que cada código de saída do robô quer dizer, em duas ou três palavras.
 *
 * Existe porque a mensagem que vem do robô são as últimas 12 linhas da execução,
 * juntadas por " | " — texto de diagnóstico, útil no balão, ilegível num chip de
 * 9px ao lado do botão. O `rc` cabe.
 *
 * A tabela completa mora no LEIA-ME.md do robô; aqui ficam só os que aparecem
 * numa falha comum. Um rc fora da lista mostra o número cru, que ainda é mais
 * informativo que nada.
 */
const RC_CURTO: Record<number, string> = {
  3: 'login',
  4: 'já baixado',
  5: 'tela não abriu',
  8: 'sessão caiu',
  9: 'tela travou',
  10: 'ambiente errado',
  12: 'não reconheceu a tela',
  13: 'validação',
  15: 'falta pré-requisito',
  16: 'sem banco',
}

function aparenciaBotaoBaixa(
  pedido: PedidoBaixa | undefined,
  temAgente: boolean,
): {
  rotulo: string
  podeClicar: boolean
  destaque: boolean
  title: string
} {
  switch (pedido?.situacao) {
    case 'na_fila':
      // SEM AGENTE o pedido não anda, e dizer "NA FILA" faz o operador esperar uma
      // janela que nunca abre (aconteceu em 21/08). Melhor admitir que está parado.
      return temAgente
        ? { rotulo: 'NA FILA', podeClicar: false, destaque: false,
            title: `Pedido por ${pedido.autor ?? 'operador'} — esperando o robô pegar` }
        : { rotulo: 'SEM ROBÔ', podeClicar: false, destaque: true,
            // O texto mudou de "nenhum agente" para "o SEU robô" quando a fila virou
            // roteada (25/08): o pedido só é pego pela máquina de quem o criou, então
            // o robô de outro operador estar ligado não ajuda em nada aqui.
            title: `Pedido por ${pedido.autor ?? 'operador'}, mas o robô DESTA máquina não está `
                 + 'de plantão. Com a fila roteada, só ele pega este pedido — robô de outro '
                 + 'operador não resolve. Abra o Iniciar-Robo.bat no seu computador.' }
    case 'executando':
      return { rotulo: 'EXECUTANDO', podeClicar: false, destaque: false,
               title: `Robô rodando em ${pedido.agente ?? 'agente'} — um por vez (Rodopar é sessão única)` }
    case 'concluido':
      return { rotulo: 'BAIXADO', podeClicar: false, destaque: false,
               title: 'Baixa confirmada pelo banco do Rodopar — o manifesto sai da tela no próximo ciclo' }
    case 'conferencia':
      return { rotulo: 'CONFERIR', podeClicar: false, destaque: true,
               title: `rc=${pedido.rc}: o Efetuar PODE ter sido clicado e o banco não confirmou. `
                    + 'Confira este manifesto no Rodopar antes de qualquer nova tentativa.' }
    case 'falhou':
      // FALHOU, e não "BAIXAR" como se nada tivesse acontecido (corrigido 26/08).
      //
      // Antes o botão voltava ao estado inicial e a única pista era o balão do
      // mouse — que ninguém passa. O robô rodava quatro minutos, falhava, e a
      // tela ficava idêntica a um manifesto intocado. Quem não estivesse com o
      // aplicativo aberto não tinha como saber que houve tentativa.
      //
      // Continua CLICÁVEL: falha comum não gravou nada no Rodopar, então repetir
      // é seguro e costuma resolver (rede, sessão, uma tela que demorou). O que
      // exige gente é rc 6/11, e esse tem estado próprio.
      return { rotulo: 'FALHOU', podeClicar: true, destaque: true,
               title: `Tentativa anterior falhou (rc=${pedido.rc}). Nada foi gravado no Rodopar — `
                    + `clique para tentar de novo.

${pedido.mensagem ?? 'sem mensagem'}` }
    default:
      return { rotulo: 'BAIXAR', podeClicar: true, destaque: false,
               title: 'Manda o robô lançar a entrega e baixar este manifesto no Rodopar' }
  }
}

function BaixaManifestoConteudo() {
  const {
    data: snapshot, pendencias, tratativas, motivos,
    fonesMotorista, rotulosFone, validacoes, motivosErro, baixaPedidos, baixaAuto, postoAuto, agenteFila, agentesFila,
    isLoading, isError, error,
  } = useManifestoPendencias()
  const pedirBaixa = usePedirBaixa()
  const liberarConferencia = useLiberarConferencia()
  // Agente vivo = bateu nos últimos 3 min. O TTL no Redis é 10 min (folga para blip de
  // rede), mas para a TELA 3 min já é "parado": o agente pede trabalho a cada ~15s.
  // `visto_em` é `string | Date`, não string: o Eden revive ISO com fuso em Date antes
  // de a tela ver. Anotar como string aqui compila localmente e quebra em produção —
  // foi o que derrubou esta página em 22/08. `new Date()` aceita os dois.
  const vivo = (b: BatidaAgente) =>
    Date.now() - new Date(b.visto_em).getTime() < 3 * 60_000
  const meuId = useAuthStore((s) => s.user?.id)
  // A lista só existe na API nova; sem ela cai no agente único, que é o contrato antigo.
  const roboVivos = (agentesFila ?? (agenteFila ? [agenteFila] : [])).filter(vivo)
  const agenteDePlantao = roboVivos.length > 0
  // F3 — o posto é MEU quando o robô que o segura é um dos meus. Comparar por
  // user_id e não por nome de máquina: o nome vem do agente e pode repetir entre
  // instalações, o user_id vem do token trm_ e é a conta que executa no Rodopar.
  const { ativar: ativarPosto, desativar: desativarPosto } = usePostoAutomacao()
  const ehMeuPosto = Boolean(postoAuto && roboVivos.some((a) => a.agente === postoAuto.agente))
  // Disparo manual do ciclo — ver useExecutarAgora. A mensagem fica na tela até o
  // próximo clique: um toast que some em 3s não serve para conferir o que o robô fez.
  const executarAgora = useExecutarAgora()
  const [resultadoCiclo, setResultadoCiclo] = useState<string | null>(null)
  // O MEU robô, que desde o roteamento é outra pergunta. Com a fila roteada, o pedido
  // que eu crio só é pego pelo robô da minha máquina — então "3 robôs conectados" com
  // o meu desligado é um selo verde mentindo sobre a minha fila.
  // TRÊS estados, não dois. Antes eram dois e o resultado mentia: eu tratava
  // "existe máquina sem identificação" como "todo mundo tem robô", achando que
  // era o lado cauteloso. É o oposto — em 25/08 uma operadora que nunca abriu o
  // programa viu o selo VERDE e o botão BAIXAR habilitado.
  //
  //   meuRoboVivo   uma máquina que se identificou como MINHA está de pé
  //   roboAnonimo   há máquina de pé, mas sem dizer de quem é (chave global)
  //
  // O botão continua funcionando no caso anônimo, e isso é verdade: sem
  // identidade a fila não roteia, então QUALQUER agente pega o pedido. O que
  // não pode é a tela deixar a pessoa achar que o robô é dela — porque a baixa
  // vai rodar na máquina de outro, sob a conta Rodopar daquela pessoa.
  const meuRoboVivo = roboVivos.some((a) => a.user_id === meuId)
  const roboAnonimo = !meuRoboVivo && roboVivos.some((a) => !a.user_id)
  // 401 = sessão expirada, e o operador só precisa relogar. O AuthGuard valida a sessão apenas
  // no mount, então cookie que vence com a tela aberta não redireciona ninguém — sem separar os
  // dois casos, o operador lê "falha" e conclui que o sistema caiu.
  const sessaoExpirou = isError && (error as (Error & { status?: number }) | null)?.status === 401
  // papel com escrita (justificativa e telefone) — o gate de verdade é no servidor; aqui só
  // decide o que mostrar. Antes isto vivia só dentro de TratativasSecao.
  const role = useAuthStore((s) => s.user?.role)
  const podeEscrever = role === 'manifesto' || role === 'supervisor' || role === 'admin'
  const now = useNow(30_000)
  const [soundOn, setSoundOn] = useState(true)
  // O token abre em diálogo pelo SELO do robô: é ele que fica âmbar chamando
  // atenção, então clicar nele para resolver é o caminho mais curto entre ver o
  // problema e corrigi-lo. Antes o painel morava no rodapé da página, abaixo do
  // relatório — longe de onde o aviso aparece.
  const [tokenAberto, setTokenAberto] = useState(false)
  const seenKeys = useRef<Set<string> | null>(null)
  const [aba, setAba] = useState<'frota' | 'demais'>('frota')
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoManifesto | 'todos'>('todos')
  const [soVencido, setSoVencido] = useState(false)
  const [soJaSaiu, setSoJaSaiu] = useState(false)
  const [soValidar, setSoValidar] = useState(false)
  // Painel de detalhes: guarda só a chave, não o objeto — a cada render re-deriva
  // do array (fresco a cada polling de 30s); some sozinho da lista (baixada) = painel fecha.
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = pendencias.find((p) => chaveManifesto(p) === selectedKey) ?? null
  // modal de contatos (ícone 📞 da tabela) — mesmo padrão: guarda a chave e re-deriva
  const [contatosDe, setContatosDe] = useState<string | null>(null)
  const pendenciaContatos = pendencias.find((p) => chaveManifesto(p) === contatosDe) ?? null

  // Desbloqueia áudio + voz no 1º gesto do usuário (autoplay policy do navegador).
  useEffect(() => {
    const unlock = () => { unlockAudio(); primeSpeech(); window.removeEventListener('pointerdown', unlock) }
    window.addEventListener('pointerdown', unlock)
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  // Som SÓ quando um manifesto ENTRA em `descarregado` (chave = manifesto|estado,
  // então virar de estado também é detectado como "nova chave"). Demais
  // transições silenciosas — com ~85 itens, som só no que exige ação (baixar).
  useEffect(() => {
    if (!pendencias.length) return
    const estados = pendencias.map(deriveEstado)
    const keys = pendencias.map((p, i) => `${chaveManifesto(p)}|${estados[i]}`)
    const prev = seenKeys.current
    seenKeys.current = new Set(keys)
    if (prev === null) return // 1ª carga: não anuncia o que já estava lá
    if (!soundOn) return
    const novasDescarregado = pendencias.filter((_, i) => !prev.has(keys[i]) && estados[i] === 'descarregado')
    if (!novasDescarregado.length) return
    // Até 3 novidades: anuncia cada uma. Acima disso, um resumo falado — nunca
    // silenciar alerta (perder "baixar manifesto" derrota a tela), nem
    // enfileirar N frases de voz num pico de fim de turno.
    if (novasDescarregado.length <= 3) {
      for (const p of novasDescarregado) {
        beepUrgente()
        speak(`Manifesto ${manifestoLabel(p)}, placa ${cavaloDe(p)}, entrega concluída. Baixar.`)
      }
    } else {
      beepUrgente()
      speak(`${novasDescarregado.length} manifestos entraram em descarregado. Baixar.`)
    }
  }, [pendencias, soundOn])

  // Abas FROTA × DEMAIS — contagem sempre nas duas (rótulo do botão), KPIs/
  // filtro/tabela abaixo operam só dentro da aba selecionada.
  const contagemAbas = useMemo(() => {
    const frota = pendencias.filter(naFrota).length
    return { frota, demais: pendencias.length - frota }
  }, [pendencias])
  const pendenciasAba = useMemo(
    () => pendencias.filter((p) => naFrota(p) === (aba === 'frota')),
    [pendencias, aba],
  )

  const total = pendenciasAba.length
  const contagemPorEstado = useMemo(() => {
    const c: Record<EstadoManifesto, number> = { descarregado: 0, descarregando: 0, aguardando_descarga: 0, em_transito: 0, sem_rastreio: 0 }
    for (const p of pendenciasAba) c[deriveEstado(p)]++
    return c
  }, [pendenciasAba])
  const vencidoCount = useMemo(() => pendenciasAba.filter(vencido).length, [pendenciasAba])
  const jaSaiuCount = useMemo(() => pendenciasAba.filter(jaSaiuDoCliente).length, [pendenciasAba])
  // fila de validação: descarregado que ninguém confirmou. Mesma regra do chip VALIDAR da linha —
  // uma função só, para o contador e a marca nunca discordarem.
  const precisaValidar = (p: PendenciaManifesto) => {
    if (deriveEstado(p) !== 'descarregado') return false
    const k = chaveTratativa(p)
    return k != null && !validacoes[k]
  }
  const validarCount = useMemo(
    () => pendenciasAba.filter(precisaValidar).length,
    [pendenciasAba, validacoes],
  )

  // Ordenação + filtro.
  const rows = useMemo(() => {
    const filtradas = pendenciasAba.filter((p) => {
      if (estadoFiltro !== 'todos' && deriveEstado(p) !== estadoFiltro) return false
      if (soVencido && !vencido(p)) return false
      if (soJaSaiu && !jaSaiuDoCliente(p)) return false
      if (soValidar && !precisaValidar(p)) return false
      return true
    })
    return [...filtradas].sort((a, b) => {
      const ra = rankEstado(a)
      const rb = rankEstado(b)
      if (ra !== rb) return ra - rb
      if (ra === 0) return (b.horas_atraso ?? 0) - (a.horas_atraso ?? 0)
      const ha = horasAbertoDe(a, now) ?? -1
      const hb = horasAbertoDe(b, now) ?? -1
      return hb - ha
    })
  }, [pendenciasAba, estadoFiltro, soVencido, soJaSaiu, soValidar, validacoes, now])

  const stale = (snapshot?.idade_min ?? 0) > 15
  // A API responde ok:true com total 0 e idade_min null quando NÃO HÁ snapshot no Redis
  // (coletor nunca enviou, chave zerada). Sem distinguir isso de "nada pendente", a tela
  // exibiria o mesmo verde tranquilizador nos dois casos.
  const semSnapshot = !!snapshot && snapshot.idade_min == null

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
            <p className="text-xs text-muted-foreground">Angellira (SM) + Sascar/Rodopar · atualiza a cada 30s</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Guia da tela (24/08). As evidências são exibidas ao operador como chave
              crua ("sm_sem_comprovacao_trava") e as regras que produzem as cores vivem
              num repositório que ele não abre. O guia é a tradução, e fica a um clique
              da tela em vez de num .md. Rota filha de /baixa-manifesto de propósito: o
              papel 'manifesto' é barrado em tudo que não comece com esse prefixo. */}
          <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
            <Link to="/baixa-manifesto/guia">
              <BookOpen className="h-3.5 w-3.5" />
              Guia
            </Link>
          </Button>
          {/* Estado do robô de baixa — SEMPRE visível (22/08).
              Antes o operador só descobria que o robô estava fora se tivesse um pedido
              na fila: o chip SEM ROBÔ aparecia na linha. Sem pedido, nenhum sinal — e a
              pergunta "o robô está ligado?" não tem como ser respondida clicando e
              esperando. Agora responde antes de clicar. */}
          <button
            type="button"
            onClick={() => setTokenAberto(true)}
            aria-label="Abrir o token do meu robô"
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            style={
              // tokens do design system, sem hex de fallback: cor fixa aqui quebraria no
              // tema escuro. 'sem-sinal' é o token certo para o desconectado — é
              // literalmente o que é.
              meuRoboVivo
                ? { background: 'var(--status-ok-bg)', color: 'var(--status-ok-fg)' }
                : roboAnonimo
                  // âmbar, não verde: funciona, mas não é o robô desta pessoa.
                  ? { background: 'var(--status-em-risco-bg)', color: 'var(--status-em-risco-fg)' }
                  : { background: 'var(--status-sem-sinal-bg)', color: 'var(--status-sem-sinal-fg)' }
            }
            title={
              meuRoboVivo
                ? `O botão BAIXAR funciona. Rodando em:\n${roboVivos.map((a) => `• ${a.agente}`).join('\n')}`
                : roboAnonimo
                  ? 'Há robô de plantão, mas ele não se identificou — está usando a chave '
                    + 'antiga em vez do token. O botão BAIXAR funciona, porém a baixa vai '
                    + 'rodar na máquina de outra pessoa, sob a conta Rodopar DELA. Para o '
                    + 'seu manifesto ser baixado pela sua máquina, abra o programa e '
                    + 'cadastre o seu token.'
                  : 'Nenhum robô de plantão: abra o programa na sua máquina. '
                    + 'Sem ele, BAIXAR só enfileira e nada é enviado ao Rodopar.'
            }
          >
            <Bot className="h-3.5 w-3.5" />
            {/* Mostra o NÚMERO quando há mais de um. Com uma máquina por operador, um
                selo que diz só "conectado" não distingue "os três de pé" de "dois
                caíram" — e é a segunda situação que muda o que o operador faz. */}
            {meuRoboVivo
              ? (roboVivos.length === 1 ? 'Robô conectado' : `${roboVivos.length} robôs conectados`)
              : roboAnonimo
                ? 'Robô sem identificação'
                : 'Robô desconectado'}
          </button>
          {/* F3 — POSTO DE AUTOMAÇÃO. Uma máquina por vez executa a baixa automática;
              as outras só veem que está ativo e onde.

              O botão só aparece para quem tem robô de plantão: a baixa roda sob a conta
              Rodopar da máquina que executa, e ativar sem robô de pé criaria pedidos que
              ninguém pode cumprir — que ainda por cima bloqueiam o pedido humano do mesmo
              manifesto pelo índice único. Quem não é dono vê o estado, não o controle. */}
          {postoAuto ? (
            <button
              type="button"
              disabled={!ehMeuPosto || desativarPosto.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs disabled:opacity-70"
              style={{ borderColor: 'var(--status-no-prazo-fg)', color: 'var(--status-no-prazo-fg)' }}
              title={
                ehMeuPosto
                  ? 'A automação está ativa NESTA máquina. Clique para desativar.'
                  : `Automação ativa em ${postoAuto.agente}${postoAuto.nome ? ` (${postoAuto.nome})` : ''} — só aquela máquina pode desativar.`
              }
              onClick={() => { if (ehMeuPosto) desativarPosto.mutate() }}
            >
              <Bot className="h-3.5 w-3.5" />
              {ehMeuPosto ? 'Automação ligada (aqui)' : `Automação em ${postoAuto.agente}`}
            </button>
          ) : meuRoboVivo ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              disabled={ativarPosto.isPending}
              title="Assume a baixa automática NESTA máquina. Enquanto estiver ligada, não abra o Rodopar no seu login — o robô perde a sessão."
              onClick={() => ativarPosto.mutate()}
            >
              <Bot className="h-3.5 w-3.5" />
              {ativarPosto.isPending ? 'Ativando…' : 'Ativar automação'}
            </Button>
          ) : null}
          {/* Executar agora — só faz sentido com o posto ativo AQUI: sem posto o ciclo
              avalia e não enfileira, e o botão prometeria o que não pode cumprir. */}
          {ehMeuPosto && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              disabled={executarAgora.isPending}
              title="Roda um ciclo agora em vez de esperar os 10 min. Mesmas regras e mesmo teto — só adianta."
              onClick={() => {
                setResultadoCiclo(null)
                executarAgora.mutate(undefined, {
                  onSuccess: (d) => {
                    const r = d?.resumo
                    if (!r) { setResultadoCiclo('Ciclo executado.'); return }
                    const partes = [`${r.elegiveis} elegível(is)`, `${r.enfileirados} enfileirado(s)`]
                    if (r.naoEnfileirados) partes.push(r.naoEnfileirados)
                    // Falha isolada continua sendo falha: desde 31/08 um manifesto que
                    // estoura não derruba mais o ciclo, e é justamente por isso que ele
                    // precisa aparecer aqui — senão some num ciclo de aparência normal.
                    if (r.falhas?.length) {
                      partes.push(
                        `⚠ ${r.falhas.length} falha(s) ao enfileirar: ${r.falhas.map((f) => f.codman).join(', ')}`,
                      )
                    }
                    if (r.modo !== 'real') partes.push('modo SOMBRA — nada é enfileirado')
                    setResultadoCiclo(partes.join(' · '))
                  },
                  onError: (e) => setResultadoCiclo((e as Error).message),
                })
              }}
            >
              <Bot className="h-3.5 w-3.5" />
              {executarAgora.isPending ? 'Executando…' : 'Executar agora'}
            </Button>
          )}
          {resultadoCiclo && (
            <span className="text-xs text-muted-foreground" title="Resultado do último disparo manual">
              {resultadoCiclo}
            </span>
          )}
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
          {/* Numa tela cujo trabalho é não deixar manifesto passar, "verde + Atualizado" quando
              a leitura falhou é pior que erro nenhum: o operador confia numa lista que pode
              estar congelada ou vazia por falha, não por não haver pendência. */}
          {isError ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--destructive)' }}>
              <span className="h-2 w-2 rounded-full" style={{ background: 'var(--destructive)' }} />
              {sessaoExpirou
                ? 'Sessão expirada — recarregue a página para entrar de novo'
                : 'Falha ao atualizar — a lista pode estar defasada'}
            </span>
          ) : semSnapshot ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--destructive)' }}>
              <span className="h-2 w-2 rounded-full" style={{ background: 'var(--destructive)' }} />
              Sem dados do coletor
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> {isLoading ? 'Carregando…' : 'Atualizado'}
            </span>
          )}
        </div>
      </div>

      {/* Banner de staleness */}
      {stale && (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <span>⚠ Coletor sem enviar há {Math.round(snapshot?.idade_min ?? 0)} min</span>
        </div>
      )}

      {/* Abas FROTA × DEMAIS (decisão Danilo 11/08, ver V2-CONTRATO.md) */}
      <Tabs value={aba} onValueChange={(v) => setAba(v as 'frota' | 'demais')}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="frota" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Frota <span className="ml-2 text-xs opacity-80 tabular-nums">({contagemAbas.frota})</span>
          </TabsTrigger>
          <TabsTrigger value="demais" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Demais (agregados) <span className="ml-2 text-xs opacity-80 tabular-nums">({contagemAbas.demais})</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* KPIs */}
      {/* Fila pedida sem ninguém para executar. Isto NÃO é decoração: em 21/08 o
          operador clicou BAIXAR, leu "NA FILA" e ficou esperando uma janela abrir que
          nunca abriria — o agente não estava rodando em máquina nenhuma. Um botão que
          promete o que não pode cumprir é pior que um botão desabilitado. */}
      {!agenteDePlantao && Object.values(baixaPedidos).some((x) => x.situacao === 'na_fila') && (
        <div
          className="mb-3 rounded-lg px-4 py-3 text-sm"
          style={{ background: 'var(--status-atrasado-bg)', border: '1px solid var(--status-atrasado-fg)' }}
        >
          <strong style={{ color: 'var(--status-atrasado-fg)' }}>Nenhum robô de plantão.</strong>{' '}
          Há pedido de baixa na fila e ninguém para executar — o agente não está rodando em
          nenhuma máquina. Os pedidos ficam parados até alguém subir o
          <span className="mx-1 font-mono text-xs">Agente-Baixa.ps1</span>
          na máquina do robô. Nada foi enviado ao Rodopar.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl bg-card px-4 py-3" style={{ border: '1px solid var(--border)' }}>
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{total}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">TOTAL ABERTOS</div>
        </div>
        {ESTADOS.map((e) => (
          <div key={e.key} className="rounded-xl bg-card px-4 py-3" style={{ border: '1px solid var(--border)' }}>
            <div className="text-3xl font-bold tabular-nums" style={{ color: e.fg }}>{contagemPorEstado[e.key]}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{e.emoji} {e.label.toUpperCase()}</div>
          </div>
        ))}
        <div className="rounded-xl bg-card px-4 py-3" style={{ border: '1px solid var(--border)' }}>
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'var(--status-atrasado-fg)' }}>{vencidoCount}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PRAZO VENCIDO</div>
        </div>
        <div className="rounded-xl bg-card px-4 py-3" style={{ border: '1px solid var(--border)' }}>
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'var(--status-atrasado-fg)' }}>{jaSaiuCount}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">JÁ SAIU DO CLIENTE</div>
        </div>
        {/* Validação pendente: descarregado que ninguém confirmou ainda. Clicável porque é uma
            fila de trabalho, não só um número — o operador filtra e vai fechando. */}
        <button
          type="button"
          onClick={() => setSoValidar((v) => !v)}
          className="rounded-xl bg-card px-4 py-3 text-left"
          style={{ border: soValidar ? '2px solid var(--primary)' : '1px solid var(--border)' }}
          title="Descarregados que ainda não foram confirmados pelo operador — clique para filtrar"
        >
          <div className="text-3xl font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{validarCount}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">A VALIDAR</div>
        </button>
      </div>

      {/* Filtro rápido — 85 itens não rola sem filtro */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setEstadoFiltro('todos')}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={estadoFiltro === 'todos'
            ? { background: 'var(--primary)', color: 'white' }
            : { background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          Todos ({total})
        </button>
        {ESTADOS.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => setEstadoFiltro((v) => (v === e.key ? 'todos' : e.key))}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={estadoFiltro === e.key ? { background: e.fg, color: 'white' } : { background: e.bg, color: e.fg }}
          >
            {e.emoji} {e.label} ({contagemPorEstado[e.key]})
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSoVencido((v) => !v)}
          className="ml-2 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={soVencido
            ? { background: 'var(--status-atrasado-fg)', color: 'white' }
            : { background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          ⏰ Só prazo vencido
        </button>
        <button
          type="button"
          onClick={() => setSoJaSaiu((v) => !v)}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={soJaSaiu
            ? { background: 'var(--status-atrasado-fg)', color: 'white' }
            : { background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          🚪 Já saiu do cliente ({jaSaiuCount})
        </button>
      </div>

      {/* Tabela + painel de detalhes (clique na linha) */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <PanelCard
            title={<span className="flex items-center gap-2 text-sm"><PackageCheck className="h-4 w-4 text-primary" /> Manifestos abertos</span>}
            subtitle={`${rows.length} de ${total}`}
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground" style={{ borderColor: 'var(--border)' }}>
                    <th className="px-3 py-2.5 font-medium">Manifesto</th>
                    <th className="px-3 py-2.5 font-medium">Estado</th>
                    <th className="w-12 px-2 py-2.5 text-center font-medium" title="Origem do veredito do estado — GPS do rastreador, SM da Angellira ou macro do motorista">Orig</th>
                    <th className="px-2 py-2.5 text-center font-medium" title="Se a trava do baú comprovou a descarga no destino — só existe na frota; nos agregados a coluna fica vazia porque não há trava para ler">Trava</th>
                    <th className="px-2 py-2.5 text-center font-medium" title="O caminhão já descarregou e deixou o cliente, e o manifesto continua aberto">Saiu</th>
                    <th className="px-2 py-2.5 text-center font-medium" title="Elegível para baixa automática pelo status confirmado no portal do cliente">Auto</th>
                    <th className="px-3 py-2.5 text-right font-medium">Ações</th>
                    <th className="px-3 py-2.5 font-medium">Prazo</th>
                    <th className="px-3 py-2.5 font-medium">Cavalo</th>
                    <th className="px-3 py-2.5 font-medium">Motorista</th>
                    <th className="w-10 px-2 py-2.5 text-center font-medium" title="Contatos">
                      <Phone className="mx-auto h-3.5 w-3.5" />
                    </th>
                    <th className="px-3 py-2.5 font-medium">Cliente/Destino</th>
                    <th className="px-3 py-2.5 font-medium" title="Referência que o cliente usa para a viagem (ORDCOM do CTe) — a chave para conferir no portal dele">Referência</th>
                    <th className="px-3 py-2.5 font-medium">Km do destino</th>
                    <th className="px-3 py-2.5 font-medium">Aberto há</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const key = chaveManifesto(p)
                    const estado = deriveEstado(p)
                    const info = ESTADO_INFO[estado]
                    const horasAberto = horasAbertoDe(p, now)
                    // chave da tratativa é a natural do Rodopar, diferente da chave de UI
                    // acima (que também cobre o formato v1) — ver chaveTratativa
                    const chaveT = chaveTratativa(p)
                    const resumoTratativa: ResumoTratativa | undefined = chaveT ? tratativas[chaveT] : undefined
                    // telefones já mesclados (Rodopar + cadastrados) — `fonesUteis` conta os que
                    // não estão riscados: zero significa "não tenho como falar com este motorista"
                    const fonesDaLinha = contatosDaPendencia(p, fonesMotorista).flatMap((c) => c.fones)
                    const fonesUteis = fonesDaLinha.filter((f) => !f.naoFunciona).length
                    // descarregado que ninguém validou ainda: é o que sustenta a medição de
                    // precisão, e validação opcional enviesaria o número (valida-se o estranho)
                    const validarPendente = precisaValidar(p)
                    // pedido de baixa deste manifesto, se houver — governa o botão
                    const pedidoBaixa = baixaPedidos[chaveTratativa(p) ?? ''] as PedidoBaixa | undefined
                    const apBaixa = aparenciaBotaoBaixa(pedidoBaixa, meuRoboVivo || roboAnonimo)
                    const cliente = p.sm?.cliente || p.destino || '—'
                    const destinoLinha = [p.destino, p.destino_uf ?? p.viagem?.destino_uf].filter(Boolean).join('/')
                    return (
                      <tr
                        key={key}
                        className="cursor-pointer border-b hover:bg-muted/30"
                        style={{ borderColor: 'var(--border)', background: key === selectedKey ? 'rgba(26,79,196,0.08)' : undefined }}
                        onClick={() => setSelectedKey(key)}
                      >
                        <td className="px-3 py-2">
                          {p.codman != null ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
                              <span className="font-mono font-bold">{p.codman}</span>
                              <span className="text-[9px] text-muted-foreground">f{p.filial ?? '—'}{p.serie ? `/${p.serie}` : ''}</span>
                              {/* já justificado: o operador vê sem abrir o painel, e o title
                                  mostra o motivo mais recente no hover */}
                              {resumoTratativa && (
                                <span
                                  className="ml-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 text-[9px] font-bold"
                                  style={{ background: 'var(--muted-foreground)', color: 'var(--background)' }}
                                  title={`${resumoTratativa.ultima.motivo_rotulo}${resumoTratativa.ultima.notes ? ` — ${resumoTratativa.ultima.notes}` : ''} (${resumoTratativa.ultima.autor ?? 'autor não identificado'})`}
                                >
                                  <MessageSquare className="h-2.5 w-2.5" />
                                  {resumoTratativa.total}
                                </span>
                              )}
                            </span>
                          ) : p.manifestos?.length ? (
                            <div className="flex flex-wrap items-center gap-1">
                              {p.manifestos.map((m) => (
                                <span key={m.codman} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
                                  <span className="font-mono font-bold">{m.codman}</span>
                                  <span className="text-[9px] text-muted-foreground">f{m.filial}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">aguardando emissão</span>
                          )}
                        </td>
                        {/* UMA COLUNA POR SELO (31/08). Antes isto era um <td> só, com um flex de OITO
                            filhos e sete deles condicionais — então a posição de cada selo dependia do
                            que a linha por acaso tinha, e o BAIXAR mudava de lugar a cada linha. Num
                            botão IRREVERSÍVEL isso é risco de clique errado, não só desalinho.

                            Coluna de verdade resolve sem número mágico: numa <table> a largura é do
                            CONJUNTO das linhas, então todas alinham por construção — inclusive quando
                            o rótulo do botão cresce de BAIXAR para EXECUTANDO, ou quando o chip de rc
                            aparece. Mesma saída que a coluna do telefone e a de Referência já usaram,
                            pelo mesmo motivo, e a mesma da MatrizTab do GRPage. */}
                        <td className="px-3 py-2">
                            <span
                              className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold whitespace-nowrap"
                              style={{ background: info.bg, color: info.fg }}
                            >
                              {info.emoji} {info.label}
                            </span>
                        </td>
                        <td className="w-12 px-2 py-2 text-center">
                            {p.origem_estado && (
                              <span
                                className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                                style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                                title="Origem do veredito do estado"
                              >
                                {ORIGEM_LABEL[p.origem_estado]}
                              </span>
                            )}
                        </td>
                        <td className="px-2 py-2 text-center">
                            {p.comprovacao_trava != null && (
                              <span
                                className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap"
                                style={{
                                  background: p.comprovacao_trava ? TRAVA_CHIP.sim.bg : TRAVA_CHIP.nao.bg,
                                  color: p.comprovacao_trava ? TRAVA_CHIP.sim.fg : TRAVA_CHIP.nao.fg,
                                }}
                                title={p.comprovacao_trava ? TRAVA_CHIP.sim.title : TRAVA_CHIP.nao.title}
                              >
                                {p.comprovacao_trava ? TRAVA_CHIP.sim.label : TRAVA_CHIP.nao.label}
                              </span>
                            )}
                        </td>
                        <td className="px-2 py-2 text-center">
                            {jaSaiuDoCliente(p) && (
                              <span
                                className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap"
                                style={{ background: JA_SAIU_CHIP.bg, color: JA_SAIU_CHIP.fg }}
                                title={JA_SAIU_CHIP.title}
                              >
                                {JA_SAIU_CHIP.label}
                              </span>
                            )}
                        </td>
                        <td className="px-2 py-2 text-center">
                            {/* F2 — o que a automação decidiu. Em SOMBRA o selo diz
                                explicitamente que nada foi enfileirado: enquanto a regra
                                está sendo medida, a fila continua sendo do operador, e um
                                selo ambíguo aqui faria ele parar de agir esperando o robô. */}
                            {(() => {
                              const auto = baixaAuto[chaveTratativa(p) ?? '']
                              if (!auto?.elegivel) return null
                              const c = auto.modo === 'real' ? AUTO_CHIP.real : AUTO_CHIP.sombra
                              return (
                                <span
                                  className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap"
                                  style={{ background: c.bg, color: c.fg }}
                                  title={`${c.title}${auto.cliente_status ? ` — cliente diz ${auto.cliente_status}` : ''}`}
                                >
                                  {c.label}
                                </span>
                              )
                            })()}
                        </td>
                        {/* Ações juntas e ancoradas à direita: o mouse aprende UM lugar. O justify-end
                            é o que garante que a linha SEM o VALIDAR não desloque o botão de baixa —
                            ancorar pela esquerda traria o problema de volta em menor escala. */}
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* validação pedida em TODOS os descarregados (decisão Danilo):
                                validação opcional enviesaria a precisão medida, porque se valida
                                o caso estranho e se ignora o óbvio */}
                            {validarPendente && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSelectedKey(key) }}
                                className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap hover:opacity-80"
                                style={{ background: 'var(--primary)', color: '#fff' }}
                                title="Abrir para confirmar se o sistema acertou — é o que mede a precisão do alerta"
                              >
                                VALIDAR
                              </button>
                            )}
                            {/* Botão de baixa (20/08): manda o robô lançar a entrega e clicar
                                Efetuar no Rodopar. IRREVERSÍVEL — por isso confirma antes, com o
                                número do manifesto na pergunta. Só aparece em item v2 (tem codman);
                                item v1 não tem o que mandar pro robô. */}
                            {p.codman != null && p.filial != null && (
                              <button
                                type="button"
                                disabled={!apBaixa.podeClicar || pedirBaixa.isPending}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  // conferência abre o painel em vez de tentar de novo: quem
                                  // resolve rc 6/11 é uma pessoa olhando o Rodopar
                                  if (!apBaixa.podeClicar) {
                                    if (pedidoBaixa?.situacao === 'conferencia') setSelectedKey(key)
                                    return
                                  }
                                  const confirmou = window.confirm(
                                    `Baixar o manifesto ${p.codman} no Rodopar?

` +
                                      `${p.cavalo ?? ''}  ${destinoLinha}

` +
                                      'O robô vai lançar a entrega e clicar Efetuar. Não tem desfazer.',
                                  )
                                  if (!confirmou) return
                                  pedirBaixa.mutate({
                                    codman: p.codman!,
                                    filial: p.filial!,
                                    serie: p.serie ?? '',
                                    placa: p.cavalo ?? undefined,
                                    destino: p.destino ?? undefined,
                                    estado_sistema: estado,
                                  })
                                }}
                                className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap hover:opacity-80 disabled:cursor-default disabled:opacity-100"
                                style={
                                  apBaixa.destaque
                                    ? { background: 'var(--status-atrasado-fg)', color: '#fff' }
                                    : apBaixa.podeClicar
                                      ? { background: 'var(--foreground)', color: 'var(--background)' }
                                      : { background: 'var(--muted)', color: 'var(--muted-foreground)' }
                                }
                                title={apBaixa.title}
                              >
                                {apBaixa.rotulo}
                              </button>
                            )}
                            {/* O motivo ao lado do botão, sem depender de hover. O texto do
                                robô é diagnóstico e não cabe aqui; o rc traduzido cabe e diz
                                o suficiente para a pessoa decidir entre repetir e chamar ajuda. */}
                            {pedidoBaixa?.situacao === 'falhou' && (
                              <span
                                className="rounded px-1 py-0.5 text-[9px] font-semibold whitespace-nowrap"
                                style={{ background: 'var(--status-atrasado-bg)', color: 'var(--status-atrasado-fg)' }}
                                title={pedidoBaixa.mensagem ?? undefined}
                              >
                                {pedidoBaixa.rc != null ? (RC_CURTO[pedidoBaixa.rc] ?? `rc=${pedidoBaixa.rc}`) : 'sem código'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <div className="text-muted-foreground">{fmtLocal(p.prazo_entrega_local)}</div>
                          {vencido(p) && (
                            <div className="font-semibold" style={{ color: 'var(--status-atrasado-fg)' }}>
                              atraso {Math.round(p.horas_atraso!)}h
                            </div>
                          )}
                          {!prazoConfiavel(p) && (
                            <div
                              className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                              title={SEM_PRAZO_CHIP.title}
                            >
                              ⚪ {SEM_PRAZO_CHIP.label}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-mono">{cavaloDe(p)}</div>
                          <div className="text-[10px] text-muted-foreground">{carretaDe(p)}</div>
                        </td>
                        <td className="px-3 py-2 font-medium">{p.motorista || '—'}</td>
                        {/* coluna própria: ícone sempre alinhado, independente do tamanho do nome */}
                        <td className="w-10 px-2 py-2 text-center">
                          {(fonesDaLinha.length > 0 || (podeEscrever && codmotDaPendencia(p))) && (
                            <button
                              type="button"
                              className="rounded-md p-1 hover:bg-muted"
                              style={{ color: fonesUteis > 0 ? 'var(--primary)' : 'var(--muted-foreground)' }}
                              title={
                                fonesDaLinha.length === 0
                                  ? 'Sem telefone no cadastro — cadastrar'
                                  : fonesUteis === 0
                                    ? 'Todos os telefones marcados como "não funciona"'
                                    : 'Ver telefones'
                              }
                              onClick={(e) => { e.stopPropagation(); setContatosDe(key) }}
                            >
                              <Phone className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-foreground">{cliente}</div>
                          <div className="text-[10px] text-muted-foreground">{destinoLinha || '—'}</div>
                        </td>
                        {/* Coluna própria (29/08): a referência saiu de baixo do cliente porque
                            aquela célula já empilhava três linhas, e porque em coluna ela deixa de
                            ser só um número para consultar — a FAMÍLIA fica visível de relance
                            (LT = Shopee, B1 = Nestlé, texto livre = sem portal), que é o que separa
                            o que a automação alcança do que ela nunca vai alcançar.
                            Aqui o '—' é informação, não ruído: marca o manifesto sem CTe. */}
                        <td className="px-3 py-2">
                          {p.referencia_cliente?.valor ? (
                            <span
                              className="font-mono text-[11px] tracking-tight"
                              style={p.referencia_cliente.guardas_erp_ok === false ? { color: 'var(--muted-foreground)' } : undefined}
                              title={
                                p.referencia_cliente.guardas_erp_ok === false
                                  ? `Não serve como chave: ${(p.referencia_cliente.guardas_reprovadas ?? []).join(' · ')}`
                                  : 'Referência do cliente (ORDCOM)'
                              }
                            >
                              {p.referencia_cliente.valor}
                              {p.referencia_cliente.guardas_erp_ok === false && (
                                <span style={{ color: 'var(--status-atrasado-fg)' }}> ⚠</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{fmtKm(kmDestinoDe(p))}</td>
                        <td className="px-3 py-2">
                          {horasAberto == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={horasAberto > 24 ? 'font-semibold' : undefined} style={horasAberto > 24 ? { color: 'var(--status-atrasado-fg)' } : undefined}>
                              {formatDuration(Math.round(horasAberto * 60))}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={15} className="px-3 py-8 text-center text-muted-foreground">
                        {/* nunca afirmar "nenhum manifesto" sem ter conseguido ler: lista vazia
                            e leitura falhada são coisas diferentes para quem opera a fila */}
                        {isError ? (
                          <span className="font-semibold" style={{ color: 'var(--destructive)' }}>
                            {sessaoExpirou
                              ? 'Sua sessão expirou. Recarregue a página (F5) para entrar de novo — os manifestos continuam sendo coletados normalmente.'
                              : 'Não foi possível ler os manifestos — não assuma que a lista está vazia. Recarregue a página.'}
                          </span>
                        ) : semSnapshot ? (
                          <span className="font-semibold" style={{ color: 'var(--destructive)' }}>
                            Sem dados do coletor — a lista não reflete a operação. Verifique se o coletor está rodando.
                          </span>
                        ) : isLoading ? (
                          'Carregando manifestos…'
                        ) : (
                          'Nenhum manifesto aberto com esse filtro.'
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>

          {/* Relatório de motivos: recolhido por padrão e só busca quando aberto — a fila de
              manifestos é a função crítica da tela e não pode dividir atenção nem carga com ele. */}
          <div className="mt-3">
            <RelatorioMotivos />
          </div>

        </div>

        {selected && (
          <FixedPanel>
            {/* key OBRIGATÓRIA: clicar de um manifesto para outro troca `selected` numa única
                atualização de estado, então o painel nunca desmonta e o React o reconcilia
                no lugar — o texto que o operador digitou na justificativa de A permaneceria
                no formulário de B e poderia ser gravado no manifesto errado, num registro
                append-only que não dá para editar nem apagar. Com a key, trocar de manifesto
                remonta o painel e zera todo o estado local dele. */}
            <ManifestoDetailPanel
              key={selectedKey}
              pendencia={selected}
              now={now}
              motivos={motivos}
              fonesMotorista={fonesMotorista}
              validacoes={validacoes}
              motivosErro={motivosErro}
              podeEscrever={podeEscrever}
              pedidoBaixa={baixaPedidos[chaveTratativa(selected) ?? ''] as PedidoBaixa | undefined}
              agenteFila={agenteFila}
              onLiberarConferencia={(id) => {
                // "Conferi no Rodopar" é declaração de uma PESSOA — por isso confirma de novo:
                // liberar sem ter olhado devolve o manifesto para a fila com o Efetuar em aberto.
                const ok = window.confirm(
                  `Você abriu este manifesto no Rodopar e conferiu se ele recebeu ocorrência?

Liberar sem conferir pode fazer o robô lançar a entrega duas vezes.`,
                )
                if (ok) liberarConferencia.mutate({ id })
              }}
              onClose={() => setSelectedKey(null)}
            />
          </FixedPanel>
        )}
      </div>

      {/* key OBRIGATÓRIA: este Dialog fica sempre montado (só alterna `open`), então sem ela o
          número digitado no formulário de um motorista permaneceria ao abrir o de outro — e podia
          ser cadastrado na pessoa errada. Mesmo remédio do painel de detalhes. */}
      <ContatosDialog
        key={contatosDe ?? 'sem-contato'}
        pendencia={pendenciaContatos}
        onClose={() => setContatosDe(null)}
        fonesMotorista={fonesMotorista}
        rotulos={rotulosFone}
        podeEscrever={podeEscrever}
      />

      {/* Token do robô. Em diálogo, e aberto pelo SELO — não é coisa do dia a dia:
          cadastra uma vez por máquina e não se toca mais. Ocupar espaço fixo na tela
          que o operador usa o expediente inteiro seria cobrar atenção permanente por
          algo que se resolve uma vez. */}
      <Dialog open={tokenAberto} onOpenChange={setTokenAberto}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">Meu robô</DialogTitle>
          </DialogHeader>
          <TokenDoAgente />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Painel de detalhes (clique na linha) ────────────────────────────────────
// Só leitura — a baixa continua no Rodopar. Ficha label+valor no estilo do
// TripDetailPanel (viagens): grid 2 colunas, seções com header uppercase.

function Metric({ label, value, valueStyle }: { label: string; value: string; valueStyle?: CSSProperties }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-foreground truncate" style={valueStyle}>{value}</p>
    </div>
  )
}

/**
 * Modal de contatos: aberto pelo ícone 📞 da tabela. Um botão por número — clique disca via tel:.
 *
 * É a superfície de ESCRITA dos telefones (13/08): o Rodopar manda um número só por motorista
 * (medido: 87/87) e é read-only para nós, então quando aquele número não atende o operador não
 * tem alternativa. Aqui ele cadastra outros e marca os que não funcionam. O riscado continua
 * visível e clicável — é aviso de "já tentaram", não bloqueio.
 */
function ContatosDialog({
  pendencia, onClose, fonesMotorista, rotulos, podeEscrever,
}: {
  pendencia: PendenciaManifesto | null
  onClose: () => void
  fonesMotorista: Record<string, FoneMotoristaRegistro[]>
  rotulos: readonly string[]
  podeEscrever: boolean
}) {
  const contatos = pendencia ? contatosDaPendencia(pendencia, fonesMotorista) : []
  const marcar = useMarcarFoneMotorista()
  const adicionar = useAdicionarFoneMotorista()
  // discador net2phone: quando disponível, ligar sai pelo navegador do operador (headset).
  // O link tel: continua ali como alternativa para quem não tem headset ou sessão.
  const discador = useDiscador()
  const [novo, setNovo] = useState('')
  const [rotulo, setRotulo] = useState(rotulos[0] ?? 'Celular')
  const [aviso, setAviso] = useState<string | null>(null)

  const enviarNovo = (codmot: string, nome: string) => {
    setAviso(null)
    if (!foneValido(digitosFone(novo))) {
      setAviso('Informe DDD + número (10 ou 11 dígitos).')
      return
    }
    adicionar.mutate(
      { codmot, numero: novo.trim(), rotulo, motorista_nome: nome },
      {
        onSuccess: (r) => {
          setNovo('')
          if (r?.ja_existia) {
            setAviso(
              r.fone?.nao_funciona
                ? 'Esse número já está cadastrado e está marcado como "não funciona" — use Desfazer na linha dele.'
                : 'Esse número já está cadastrado.',
            )
          }
        },
        onError: (e) => setAviso((e as Error).message),
      },
    )
  }

  return (
    <Dialog open={!!pendencia} onOpenChange={(aberto) => { if (!aberto) { onClose(); setAviso(null) } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Contatos do motorista</DialogTitle>
        </DialogHeader>
        {pendencia && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Cavalo <span className="font-mono">{cavaloDe(pendencia)}</span>
            {' · '}manifesto <span className="font-mono">{manifestoLabel(pendencia)}</span>
          </p>
        )}
        <div className="space-y-4">
          {contatos.map((c) => (
            <div key={c.codmot ?? c.nome}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.nome}</p>
              <div className="space-y-1.5">
                {c.fones.map((f) => (
                  // key por dígitos: o MESMO número em dois formatos daria key duplicada
                  <div key={f.digitos} className="flex items-center gap-1.5">
                    <a
                      href={telHref(f.numero)}
                      className="flex flex-1 items-center justify-between rounded-md border px-3 py-2 hover:bg-muted"
                      style={{ borderColor: 'var(--border)' }}
                      title={f.naoFunciona && f.marcadoPor ? `marcado por ${f.marcadoPor}` : undefined}
                    >
                      <span className="flex items-center gap-2">
                        <Phone className="h-4 w-4" style={{ color: f.naoFunciona ? 'var(--muted-foreground)' : 'var(--primary)' }} />
                        <span
                          className="font-mono text-sm font-medium"
                          style={f.naoFunciona
                            ? { textDecoration: 'line-through', color: 'var(--muted-foreground)' }
                            : { color: 'var(--foreground)' }}
                        >
                          {f.numero}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        {f.naoFunciona && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                            style={{ background: 'var(--status-em-risco-bg)', color: 'var(--status-em-risco-fg)' }}
                          >
                            não funciona
                          </span>
                        )}
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.rotulo}</span>
                      </span>
                    </a>
                    {discador && (
                      <button
                        type="button"
                        onClick={async () => {
                          setAviso(null)
                          const err = await discador.ligar(f.numero)
                          // deu certo: este diálogo sai da frente. O painel do discador ancora no
                          // canto inferior direito e, em janela menor que ~1260px, cobriria justamente
                          // estes botões; e a lista não serve mais para nada com a chamada em curso.
                          // No erro fica aberto, porque é aqui que o aviso aparece.
                          if (err) setAviso(err)
                          else onClose()
                        }}
                        disabled={discador.chamando}
                        className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                        style={{ background: 'var(--primary)' }}
                        title="Ligar pelo navegador (headset) — o motorista recebe a chamada direto"
                      >
                        {discador.chamando ? '…' : 'Ligar'}
                      </button>
                    )}
                    {podeEscrever && c.codmot && (
                      <button
                        type="button"
                        // onError obrigatório: sem ele a falha era MUDA — o número simplesmente
                        // não riscava e o operador não sabia por quê (o gêmeo `adicionar` já tratava)
                        onClick={() => {
                          setAviso(null)
                          marcar.mutate({
                            codmot: c.codmot!, numero: f.numero,
                            nao_funciona: !f.naoFunciona, rotulo: f.rotulo, motorista_nome: c.nome,
                          }, { onError: (e) => setAviso((e as Error).message) })
                        }}
                        disabled={marcar.isPending}
                        className="shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
                        style={{ borderColor: 'var(--border)' }}
                        title={f.naoFunciona ? 'Voltar a considerar este número' : 'Marcar que este número não funciona'}
                      >
                        {f.naoFunciona ? 'Desfazer' : 'Não funciona'}
                      </button>
                    )}
                  </div>
                ))}
                {c.fones.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum telefone no cadastro do Rodopar.</p>
                )}
              </div>

              {/* aviso fora do formulário: serve tanto ao cadastro quanto ao botão de riscar,
                  e fica logo abaixo da lista onde a ação aconteceu */}
              {aviso && (
                <p className="mt-1.5 text-[10px] font-semibold" style={{ color: 'var(--destructive)' }}>
                  {aviso}
                </p>
              )}

              {podeEscrever && c.codmot && (
                <div className="mt-2.5 rounded-md border p-2.5" style={{ borderColor: 'var(--border)' }}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Acrescentar telefone
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={novo}
                      onChange={(e) => setNovo(e.target.value)}
                      placeholder="(DDD) 90000-0000"
                      maxLength={40}
                      className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
                      style={{ borderColor: 'var(--border)' }}
                    />
                    <select
                      value={rotulo}
                      onChange={(e) => setRotulo(e.target.value)}
                      className="rounded-md border bg-background px-1.5 py-1.5 text-xs text-foreground"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {rotulos.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => enviarNovo(c.codmot!, c.nome)}
                      disabled={!novo.trim() || adicionar.isPending}
                      className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      style={{ background: 'var(--primary)' }}
                    >
                      {adicionar.isPending ? '…' : 'Adicionar'}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] italic text-muted-foreground">
                    Vale para as próximas viagens deste motorista.
                  </p>
                </div>
              )}

              {podeEscrever && !c.codmot && (
                <p className="mt-2 text-[10px] italic text-muted-foreground">
                  Sem o código do motorista no Rodopar — não é possível cadastrar telefone neste manifesto.
                </p>
              )}
            </div>
          ))}
          {contatos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum telefone cadastrado para esta viagem.</p>
          )}

          {/* O widget do net2phone sai da tela sozinho quando a ligação termina — em repouso ele só
              exibe LOGOUT e o seletor Call From. Mas o Call From precisa continuar ALCANÇÁVEL: é o
              número que aparece no celular do motorista, e o SDK não permite fixá-lo por código
              (placeCall aceita só {to}). Esta é a porta de entrada para ele. */}
          {discador && (
            <div className="border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={async () => {
                  setAviso(null)
                  const err = await discador.abrirPainel()
                  // mesmo motivo do botão Ligar: o painel abre ampliado no canto inferior direito e
                  // cobriria este diálogo em tela menor. No erro fica aberto para mostrar o aviso.
                  if (err) setAviso(err)
                  else onClose()
                }}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Abrir discador — login e número de origem
              </button>
              <p className="mt-0.5 text-[10px] italic text-muted-foreground">
                Em <b>Call From</b> escolhe-se o número que o motorista vê ao receber a chamada.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Motorista no painel de detalhes: nome + TODOS os números, cada um em linha própria e clicável
// (nome comprido não engole mais o telefone). Somente leitura — a escrita fica no modal 📞.
function MotoristaLinha({ nome, fones }: { nome: string; fones?: FoneExibicao[] }) {
  return (
    <span className="block">
      <span className="block truncate" title={nome}>{nome}</span>
      {(fones ?? []).map((f) => (
        <a
          key={f.digitos}
          href={telHref(f.numero)}
          className="block font-mono hover:underline"
          style={f.naoFunciona
            ? { textDecoration: 'line-through', color: 'var(--muted-foreground)' }
            : { color: 'var(--primary)' }}
          onClick={(e) => e.stopPropagation()}
          title={f.naoFunciona ? `${f.rotulo} — marcado como "não funciona"` : f.rotulo}
        >
          📞 {f.numero}
        </a>
      ))}
    </span>
  )
}

function ManifestoDetailPanel({
  pendencia: p,
  now,
  onClose,
  motivos,
  fonesMotorista,
  validacoes,
  motivosErro,
  podeEscrever,
  pedidoBaixa,
  agenteFila,
  onLiberarConferencia,
}: {
  pendencia: PendenciaManifesto
  now: Date
  onClose: () => void
  // lista de motivos vem da API (via snapshot) para não divergir do que ela valida
  motivos: Record<string, string>
  // telefones cadastrados/riscados, para o painel mostrar o mesmo que o modal
  fonesMotorista: Record<string, FoneMotoristaRegistro[]>
  // última validação por manifesto + lista de motivos de erro (ver ValidacaoSecao)
  validacoes: Record<string, ValidacaoRegistro>
  motivosErro: Record<string, string>
  podeEscrever: boolean
  // pedido de baixa deste manifesto, quando existir
  pedidoBaixa?: PedidoBaixa
  // quem está de plantão para executar; null = ninguém, e o pedido não anda
  agenteFila?: BatidaAgente | null
  onLiberarConferencia?: (id: string) => void
}) {
  const estado = deriveEstado(p)
  const info = ESTADO_INFO[estado]
  const chaveV = chaveTratativa(p)
  const validacaoDoItem = chaveV ? validacoes[chaveV] : undefined
  // pendente = o sistema aponta baixa e ninguém confirmou ainda
  const validacaoPendente = estado === 'descarregado' && !validacaoDoItem && podeEscrever
  const horasAberto = horasAbertoDe(p, now)
  const posMin = minutesSinceLocal(p.posicao?.quando_local, now)
  const macroMin = minutesSinceLocal(p.macro?.quando_local, now)
  const contatos = contatosDaPendencia(p, fonesMotorista)
  const evidenciasV2 = Array.isArray(p.evidencias) ? p.evidencias : null
  const temGrade = p.sm?.grade_inicio_local != null || p.sm?.grade_fim_local != null

  return (
    <SidePanelLayout title={`Manifesto ${manifestoLabel(p)}`} subtitle={p.sm?.cliente || p.destino || undefined} onClose={onClose}>
      <div className="space-y-4">
        {/* Validação PRIMEIRO quando está pendente: é por isso que o operador abriu o painel.
            Antes ela ficava no fim, depois de 6 seções de ficha, e ninguém achava. Já validada,
            desce para o lugar de sempre (vira histórico, não ação). */}
        {validacaoPendente && (
          <ValidacaoSecao
            pendencia={p}
            validacao={undefined}
            motivosErro={motivosErro}
            podeEscrever={podeEscrever}
          />
        )}

        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
            <span className="font-mono font-bold text-sm">{manifestoLabel(p)}</span>
            <span className="text-[10px] text-muted-foreground">f{p.filial ?? '—'}{p.serie ? `/${p.serie}` : ''}</span>
          </span>
          <span
            className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold"
            style={{ background: info.bg, color: info.fg }}
          >
            {info.emoji} {info.label}
          </span>
        </div>

        {/* (1) Manifesto */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Manifesto</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Emissão" value={fmtLocal(p.emissao_local)} />
            <Metric label="Prazo de entrega" value={fmtLocal(p.prazo_entrega_local)} />
            <Metric
              label="Atraso"
              value={
                !prazoConfiavel(p)
                  ? 'sem prazo confiável'
                  : vencido(p)
                    ? `${Math.round(p.horas_atraso!)}h`
                    : 'no prazo'
              }
            />
            <Metric label="Aberto há" value={horasAberto == null ? '—' : formatDuration(Math.round(horasAberto * 60))} />
          </div>
          {/* Conferência humana pendente (20/08). rc 6/11 do robô significam que o Efetuar PODE
              ter sido clicado e o banco do Rodopar não confirmou — e o banco não distingue
              "intocado" de "clicado e não processado" (SITUAC='E' com DATBAI nula nos dois
              casos). Então quem resolve é uma PESSOA olhando o Rodopar, e é ela que libera. */}
          {/* Andamento da baixa pelo robô (21/08). O operador esperava "abrir para ir
              vendo" — e não abre: o robô roda no Chrome da MÁQUINA EXECUTORA, não no
              navegador dele. Então o acompanhamento tem que estar aqui. */}
          {pedidoBaixa && (
            <div className="mt-3 rounded border p-2.5 text-xs" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Baixa pelo robô
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Metric label="Situação" value={ROTULO_SITUACAO_PEDIDO[pedidoBaixa.situacao] ?? pedidoBaixa.situacao} />
                <Metric label="Pedido por" value={pedidoBaixa.autor ?? '—'} />
                <Metric label="Pedido em" value={fmtInstante(pedidoBaixa.criado_em)} />
                {pedidoBaixa.agente && <Metric label="Executando em" value={pedidoBaixa.agente} />}
                {pedidoBaixa.concluido_em && <Metric label="Terminou em" value={fmtInstante(pedidoBaixa.concluido_em)} />}
                {pedidoBaixa.rc != null && <Metric label="Código de saída" value={`rc=${pedidoBaixa.rc}`} />}
              </div>
              {pedidoBaixa.mensagem && pedidoBaixa.situacao !== 'conferencia' && (
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">{pedidoBaixa.mensagem}</p>
              )}
              {/* fila parada porque não há quem execute — a causa mais provável de
                  "cliquei e não aconteceu nada" */}
              {pedidoBaixa.situacao === 'na_fila' && !agenteFila && (
                <p className="mt-2 font-semibold" style={{ color: 'var(--status-atrasado-fg)' }}>
                  Nenhum robô de plantão: este pedido não vai andar até alguém subir o agente na
                  máquina do robô. Nada foi enviado ao Rodopar.
                </p>
              )}
              {pedidoBaixa.situacao === 'na_fila' && agenteFila && (
                <p className="mt-2 text-muted-foreground">
                  Robô de plantão em <span className="font-mono">{agenteFila.agente}</span> — ele pega
                  um manifesto por vez, porque o Rodopar é sessão única.
                </p>
              )}
            </div>
          )}
          {pedidoBaixa?.situacao === 'conferencia' && (
            <div
              className="mt-3 rounded border p-2.5 text-xs"
              style={{ borderColor: 'var(--status-atrasado-fg)', background: 'var(--status-atrasado-bg)' }}
            >
              <div className="font-bold uppercase tracking-wide" style={{ color: 'var(--status-atrasado-fg)' }}>
                Conferência pendente — rc={pedidoBaixa.rc}
              </div>
              <p className="mt-1 text-muted-foreground">
                O robô clicou <strong>Efetuar</strong> e o banco do Rodopar não confirmou. Pode ter
                gravado. Abra este manifesto no Rodopar e veja se ele recebeu ocorrência —
                <strong> não peça a baixa de novo antes disso</strong>.
              </p>
              {pedidoBaixa.mensagem && (
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{pedidoBaixa.mensagem}</p>
              )}
              {/* A RESPOSTA, em vez do dever de casa (31/08).
                  Até aqui o aviso mandava a pessoa abrir o Rodopar e procurar ocorrência —
                  e não dizia o que procurar nem onde. O coletor agora pergunta ao ERP pela
                  cadeia que o próprio Rodopar usa (RODIMA→RODCON→RODNFC→RODOCH→RODOCO com
                  FINMAN='S') e traz a resposta.
                  Os TRÊS estados são distintos de propósito: sem evidência ainda, evidência
                  de que não foi lançado, e evidência de que FOI. Tratar "ausente" como
                  "não tem" seria o mesmo erro que este bloco existe para evitar. */}
              {(() => {
                const oco = p.ocorrencia_entrega
                if (!oco || oco.erro) {
                  return (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      <strong>Ocorrência no Rodopar: ainda não verificada.</strong>{' '}
                      {oco?.erro
                        ? `A consulta falhou (${oco.erro}).`
                        : 'O coletor pergunta no próximo ciclo (até 5 min).'}{' '}
                      Até lá, confira você mesmo antes de liberar.
                    </p>
                  )
                }
                const cor = oco.tem ? 'var(--status-atrasado-fg)' : 'var(--status-no-prazo-fg)'
                return (
                  <p className="mt-2 text-[11px]" style={{ color: cor }}>
                    <strong>
                      {oco.tem
                        ? 'Ocorrência de entrega ENCONTRADA no Rodopar.'
                        : 'Ocorrência de entrega NÃO encontrada no Rodopar.'}
                    </strong>{' '}
                    {oco.tem
                      ? 'O Efetuar já foi clicado — pedir a baixa de novo DUPLICA o lançamento. A baixa deve cair sozinha quando o AGENDADOR do Rodopar rodar.'
                      : 'Nada foi lançado, então repetir é seguro.'}
                    {oco.verificado_em && (
                      <span className="text-muted-foreground"> Verificado em {fmtInstante(oco.verificado_em)}.</span>
                    )}
                  </p>
                )
              })()}
              {podeEscrever && onLiberarConferencia && (
                <button
                  type="button"
                  onClick={() => onLiberarConferencia(pedidoBaixa.id)}
                  className="mt-2 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide hover:opacity-80"
                  style={{ background: 'var(--status-atrasado-fg)', color: '#fff' }}
                  title="Confirma que você olhou o Rodopar — libera o manifesto para poder pedir a baixa de novo"
                >
                  Conferi no Rodopar — liberar
                </button>
              )}
            </div>
          )}
        </div>

        {/* (2) SM Angellira */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">SM Angellira</h4>
          {p.sm ? (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Metric label="Código" value={p.sm.codigo || '—'} />
              <Metric label="Status viagem" value={p.sm.status_viagem || '—'} />
              <Metric label="Status entrega" value={p.sm.status_entrega || '—'} />
              <Metric label="Cliente" value={p.sm.cliente || '—'} />
              <Metric label="Chegada" value={fmtLocal(p.sm.chegada_local)} />
              <Metric label="Saída" value={fmtLocal(p.sm.saida_local)} />
              <Metric label="Tempo de descarga" value={p.sm.tempo_descarga || '—'} />
              <Metric label="Atraso (SM)" value={p.sm.atraso || '—'} />
              <Metric label="Km faltante" value={fmtKm(p.sm.km_faltante ?? null)} />
              <Metric label="Previsão de chegada" value={fmtLocal(p.sm.previsao_chegada_local)} />
              {temGrade && (
                <>
                  <Metric label="Grade início" value={fmtLocal(p.sm.grade_inicio_local)} />
                  <Metric label="Grade fim" value={fmtLocal(p.sm.grade_fim_local)} />
                </>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">— sem SM vinculada (plano B: Sascar/macro)</p>
          )}
        </div>

        {/* (3) Viagem/Veículo */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Viagem / Veículo</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Cavalo" value={cavaloDe(p)} />
            <Metric label="Carreta" value={carretaDe(p)} />
            <Metric label="Destino" value={[p.destino, p.destino_uf ?? p.viagem?.destino_uf].filter(Boolean).join('/') || '—'} />
            {/* F1 — o operador precisa deste número para conferir o manifesto no portal
                do cliente à mão. Quando a referência não serve como chave, dizer POR QUE
                vale mais que escondê-la: o número continua útil para a conferência manual. */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Referência do cliente</p>
              <div className="text-sm font-medium font-mono text-foreground">
                {p.referencia_cliente?.valor || '—'}
              </div>
              {p.referencia_cliente?.guardas_erp_ok === false && (
                <p className="text-[10px]" style={{ color: 'var(--status-atrasado-fg)' }}>
                  {(p.referencia_cliente.guardas_reprovadas ?? []).join(' · ')}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Motorista(s)</p>
              <div className="text-sm font-medium text-foreground">
                {contatos.length > 0
                  ? contatos.map((c) => <MotoristaLinha key={c.nome} nome={c.nome} fones={c.fones} />)
                  : <span>{p.motorista || '—'}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* (4) No cliente — furo real (11/08): caminhão descarrega e vai embora,
            manifesto continua aberto por morosidade do operador (ver
            jaSaiuDoCliente/JA_SAIU_CHIP acima) */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">No cliente</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Chegou" value={fmtLocal(p.destino_historico?.chegou_local)} />
            <Metric label="Permanência mínima atingida" value={fmtLocal(p.destino_historico?.parado_min_descarga_local)} />
            <Metric label="Macro de fim no destino" value={fmtLocal(p.destino_historico?.macro_fim_no_destino_local)} />
            <Metric
              label="Saiu do cliente"
              value={fmtLocal(p.destino_historico?.saiu_local)}
              valueStyle={p.destino_historico?.saiu_local ? { color: 'var(--status-atrasado-fg)' } : undefined}
            />
          </div>
        </div>

        {/* (5) Sascar */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Sascar</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Cidade/UF" value={p.posicao ? `${p.posicao.cidade || '—'}/${p.posicao.uf || '—'}` : '—'} />
            <Metric label="Km do destino" value={fmtKm(p.posicao?.km_destino ?? null)} />
            <Metric label="Parado" value={p.posicao?.parado == null ? '—' : p.posicao.parado ? 'sim' : 'não'} />
            <Metric label="Transmitiu" value={posMin == null ? '—' : `há ${formatDuration(posMin)}`} />
            {p.posicao?.ponto_referencia && (
              <Metric
                label="Ponto de referência"
                value={`${p.posicao.ponto_referencia}${p.posicao.distancia_m != null ? ` · ${fmtDistancia(p.posicao.distancia_m)}` : ''}`}
              />
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <Metric label="Trava do baú" value={p.trava_bau?.estado || '—'} />
            <Metric label="Destravou no destino" value={fmtLocal(p.trava_bau?.destravou_no_destino_local)} />
            <Metric
              label="Comprovação da trava"
              value={p.comprovacao_trava == null ? 'Não aplicável (agregado)' : p.comprovacao_trava ? 'Comprovada' : 'Não comprovada'}
            />
          </div>

          <div className="mt-3 rounded-md border p-2.5" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Última macro</p>
            <p className="text-xs text-foreground">{p.macro?.ultima || '—'}</p>
            <p className="text-[10px] text-muted-foreground">{macroMin == null ? '—' : `há ${formatDuration(macroMin)}`}</p>
            {(p.macro?.digitado || p.digitado) && (
              <>
                <p className="mt-2 whitespace-pre-wrap font-mono text-xs text-foreground">{p.macro?.digitado || p.digitado}</p>
                <p className="mt-1 text-[10px] italic text-muted-foreground">campo livre digitado na boleia — apenas referência</p>
              </>
            )}
          </div>
        </div>

        {/* (6) Evidências */}
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Evidências</h4>
          {evidenciasV2 && evidenciasV2.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {evidenciasV2.map((ev) => (
                <span
                  key={ev}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                  style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                >
                  {ev}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">—</p>
          )}
        </div>

        {/* (7) Validação — aqui só quando NÃO está pendente (pendente sobe pro topo) */}
        {!validacaoPendente && (
          <ValidacaoSecao
            pendencia={p}
            validacao={validacaoDoItem}
            motivosErro={motivosErro}
            podeEscrever={podeEscrever}
          />
        )}

        {/* (8) Justificativa do operador */}
        <TratativasSecao pendencia={p} motivos={motivos} />
      </div>
    </SidePanelLayout>
  )
}

/**
 * Justificativa do operador: histórico + formulário.
 *
 * Append-only por decisão (12/08): nada é editado nem apagado — correção se faz
 * escrevendo nota nova, e o histórico é a auditoria de quem disse o quê e quando.
 * A nota vive no Postgres e SOBREVIVE à baixa do manifesto (o snapshot é volátil).
 *
 * Só aparece em manifesto v2 (precisa de codman+filial); item v1 não tem chave natural.
 * O botão fica oculto para quem não pode escrever, mas o gate real é no servidor.
 */
function TratativasSecao({
  pendencia: p,
  motivos,
}: {
  pendencia: PendenciaManifesto
  motivos: Record<string, string>
}) {
  const role = useAuthStore((s) => s.user?.role)
  const podeEscrever = role === 'manifesto' || role === 'supervisor' || role === 'admin'
  const { historico, isLoading } = useHistoricoTratativas(p.codman, p.filial, p.serie)
  const registrar = useRegistrarTratativa()

  const opcoes = Object.entries(motivos)
  const [motivo, setMotivo] = useState('')
  const [texto, setTexto] = useState('')

  if (p.codman == null || p.filial == null) return null

  const enviar = () => {
    if (!motivo) return
    registrar.mutate(
      {
        codman: p.codman!,
        filial: p.filial!,
        serie: p.serie ?? '',
        placa: cavaloDe(p),
        destino: p.destino ?? undefined,
        motivo,
        notes: texto.trim() || undefined,
      },
      { onSuccess: () => { setMotivo(''); setTexto('') } },
    )
  }

  return (
    <div>
      <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
        Justificativa {historico.length > 0 && <span className="text-muted-foreground">({historico.length})</span>}
      </h4>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">carregando…</p>
      ) : historico.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma justificativa registrada.</p>
      ) : (
        <ol className="space-y-2">
          {historico.map((t) => (
            <li key={t.id} className="rounded-md border p-2.5" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{t.motivo_rotulo}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {new Date(t.criado_em).toLocaleString('pt-BR')}
                </span>
              </div>
              {t.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">{t.notes}</p>}
              <p className="mt-1 text-[10px] text-muted-foreground">{t.autor ?? 'autor não identificado'}</p>
            </li>
          ))}
        </ol>
      )}

      {podeEscrever && (
        <div className="mt-3 rounded-md border p-2.5" style={{ borderColor: 'var(--border)' }}>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Motivo
          </label>
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs text-foreground"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="">Selecione…</option>
            {opcoes.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </select>

          <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Observação (opcional)
          </label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            // mesmo limite que a API valida (t.String maxLength 2000): cortar aqui evita
            // o operador escrever um texto longo e só descobrir no 422
            maxLength={2000}
            placeholder="O que está acontecendo com este manifesto"
            className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-xs text-foreground"
            style={{ borderColor: 'var(--border)' }}
          />

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={enviar}
              disabled={!motivo || registrar.isPending}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--primary)' }}
            >
              {registrar.isPending ? 'Registrando…' : 'Registrar justificativa'}
            </button>
            {registrar.isError && (
              <span className="text-[10px] font-semibold" style={{ color: 'var(--destructive)' }}>
                {(registrar.error as Error)?.message ?? 'falhou'}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[10px] italic text-muted-foreground">
            O registro não pode ser editado nem apagado — para corrigir, escreva uma nova justificativa.
          </p>
        </div>
      )}
    </div>
  )
}
