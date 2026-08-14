import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Phone, PhoneOff, X } from 'lucide-react'
import { N2pDialer, type N2pEstado } from '@/lib/net2phone/n2p-dialer.js'
import { digitosFone, foneValido } from '@/lib/telefone'

/**
 * Discador net2phone embutido na tela — ligar pelo navegador, sem sair do painel.
 *
 * Kit vindo de grupolamonica/net2phone (integracao/): a ligação sai por WebRTC do navegador do
 * OPERADOR, com áudio no headset dele. Nada toca do lado dele; o motorista recebe direto. A VPS
 * só entrega o HTML — quem registra o softphone é o navegador.
 *
 * ⚠️ RESTRIÇÕES DO SDK QUE MOLDAM ESTE COMPONENTE (auditadas no dialer-sdk.es.js, 428 linhas):
 *
 * 1. A superfície pública do SDK é só `subscribe`, `dispose` e `placeCall` — existe UM único tipo
 *    de mensagem de comando em todo o arquivo, `"placeCall"` (:419). **Não há hangup por código.**
 *    O `dispose()` (:388-391) arranca o iframe do DOM e derruba a chamada junto com a sessão SIP —
 *    é machado, não desligar. Consequência, e é a invariante mais importante daqui: **enquanto
 *    existe QUALQUER chamada viva, o widget não pode sair da tela nem ficar inalcançável**, porque
 *    o botão vermelho dentro dele é a única forma de encerrar.
 *
 * 2. `N2pDialer.criar()` **resolve antes de o embed existir de verdade**: o construtor do SDK cria o
 *    iframe, seta o `src` e faz `append` de forma síncrona (:359), e nada espera o carregamento.
 *    Disparar `placeCall` nesse instante posta a mensagem num `contentWindow` que ainda é
 *    about:blank — ela se perde, ninguém responde, e 30 s depois (:327) o SDK devolve TimeoutError,
 *    que o wrapper traduz para 'sem_sessao' (n2p-dialer.js:196). Ou seja: a primeira ligação de cada
 *    carregamento de página morria em 30 s dizendo "você não está autenticado" para quem estava
 *    autenticado. Por isso esperamos o anúncio `dialerInitialized` do embed antes de liberar o
 *    primeiro comando — ver esperarEmbedPronto().
 *
 * 3. Quem dimensiona o iframe é a página remota do fornecedor, não nós: ela manda `containerStyle`
 *    naquele mesmo anúncio e o SDK faz `Object.assign(iframe.style, {...containerStyle,
 *    display: 'block'})` (:396-401). Daí duas regras: CSS nosso no iframe perderia do style inline,
 *    e esconder com `display:none` inline seria revertido no próximo init. **Por isso escondemos o
 *    container externo (posicionamento), nunca o iframe.** O 393x600 é escolha do fornecedor.
 *
 * 4. `conferirSessao()` demora ~30 s quando não há sessão (ele provoca o timeout de propósito).
 *    Nunca chamar em caminho interativo.
 *
 * ⚠️ NORMALIZAÇÃO: o phone.mjs do kit NÃO remove o zero do DDD — "(081)98633-6617" viraria
 * "081986336617" (testado). É o mesmo defeito que o `tel:` da tela tinha. Por isso passamos por
 * digitosFone() e prefixamos 55, caindo no caminho E.164 do kit.
 *
 * ⚠️ O widget em repouso mostra LOGOUT e o seletor **Call From** — que não é enfeite: é o número
 * que aparece no celular do motorista (`placeCall` aceita só `{to}`, não dá para fixar a origem por
 * código; ver DC-517). Ele precisa ficar ALCANÇÁVEL, não precisa ficar VISÍVEL: some quando a
 * chamada termina e volta pelo `abrirPainel()`.
 *
 * ⚠️ PORTAL OBRIGATÓRIO: o painel é renderizado em `document.body`, não na árvore da página. O
 * AppLayout envolve o conteúdo num `div` com `position:relative; z-index:1` (AppLayout.tsx:47-48),
 * que cria stacking context — dentro dele, `z-index` nenhum escapa, nem em elemento `fixed`. O
 * overlay do diálogo de contatos é portalado para o body com z-50 e pintaria por cima do widget,
 * deixando o botão de desligar escurecido e inerte. Fora do stacking context, o z-60 daqui vence.
 */

const SEGUNDOS_DESFECHO = 6
const ALTURA_COMPACTA = 200
const ALTURA_AMPLIADA = 600
/** largura do iframe (imposta pelo fornecedor) + as duas bordas de 1px do nosso card */
const LARGURA_PAINEL = 395
/** calha da barra de rolagem no modo ampliado (.panel-scroll usa 4px) — sem isso ela come o widget */
const CALHA_ROLAGEM = 6
/** teto de espera pelo anúncio do embed; bem abaixo dos 30 s de timeout do SDK */
const MS_EMBED_PRONTO = 12_000

/**
 * Identifica a PERNA de chamada a que um evento pertence.
 *
 * O embed atende mais de uma chamada ao mesmo tempo (uma recebida entrando no meio de uma ligação
 * nossa, por exemplo), e todas chegam pelo mesmo callback. Guardar só "o último evento" fazia o
 * 'disconnected' de uma perna qualquer ser lido como fim de tudo — e esconder o widget com a
 * ligação do motorista ainda de pé, deixando o operador sem o único botão de desligar que existe.
 *
 * O payload do fornecedor não é documentado; usamos `id` quando ele existe e caímos em
 * direção+número quando não existe. Duas pernas para o mesmo número na mesma direção colidiriam —
 * degradação aceitável, e o pior caso volta a ser o comportamento antigo.
 */
function chaveDaChamada(info: N2pEstado): string {
  const c = info.chamada
  if (c && typeof c === 'object') {
    const id = (c as Record<string, unknown>).id
    if (typeof id === 'string' && id !== '') return id
    if (typeof id === 'number') return String(id)
  }
  return `${info.direcao || '?'}|${info.numero || '?'}`
}

interface DiscadorApi {
  /** Origina a chamada. Devolve mensagem de erro pronta para exibir, ou null em caso de sucesso. */
  ligar: (numero: string) => Promise<string | null>
  /**
   * Abre o widget sem discar — para fazer login ou trocar o número de origem (Call From).
   * Cria o iframe e espera o embed carregar: sem isso o painel abria vazio.
   */
  abrirPainel: () => Promise<string | null>
  chamando: boolean
  emChamada: boolean
  estado: N2pEstado | null
}

const Ctx = createContext<DiscadorApi | null>(null)

/** Disponível apenas dentro do DiscadorNet2phoneProvider; fora dele devolve null. */
export function useDiscador(): DiscadorApi | null {
  return useContext(Ctx)
}

export function DiscadorNet2phoneProvider({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dialerRef = useRef<N2pDialer | null>(null)
  /** o embed já anunciou que carregou? antes disso, nenhum comando chega ao outro lado */
  const prontoRef = useRef(false)
  /** quem está esperando o anúncio; o latch avisa todos de uma vez quando ele chega */
  const aguardandoProntoRef = useRef<Set<(ok: boolean) => void>>(new Set())
  /** preparo em voo, para dois cliques rápidos não criarem dois iframes e dois listeners */
  const preparoRef = useRef<Promise<N2pDialer> | null>(null)
  /** espelha `abertoPeloOperador` para o callback de estado, que tem deps [] e não lê state */
  const abertoPeloOperadorRef = useRef(false)
  /** pernas de chamada vivas, por chave — ver chaveDaChamada() */
  const vivasRef = useRef<Map<string, N2pEstado>>(new Map())
  /** quantos eventos de estado já chegaram; usado para não atropelar um ciclo já encerrado */
  const eventosRef = useRef(0)
  const timerDesfecho = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [chamando, setChamando] = useState(false)
  const [preparando, setPreparando] = useState(false)
  const [emChamada, setEmChamada] = useState(false)
  const [estado, setEstado] = useState<N2pEstado | null>(null)
  /** painel aberto por causa de uma ligação em curso */
  const [emUso, setEmUso] = useState(false)
  /** painel aberto de propósito pelo operador (login, ajustar Call From) — só ele mesmo fecha */
  const [abertoPeloOperador, setAbertoPeloOperador] = useState(false)
  /** recolhido DURANTE a chamada: a barra continua, com botão para trazer o desligar de volta */
  const [minimizado, setMinimizado] = useState(false)
  const [ampliado, setAmpliado] = useState(false)
  /** mostra o resultado da última chamada por alguns segundos, depois a barra também sai */
  const [desfecho, setDesfecho] = useState(false)

  const limparTimer = () => {
    if (timerDesfecho.current) {
      clearTimeout(timerDesfecho.current)
      timerDesfecho.current = null
    }
  }

  /** state + ref sempre juntos: o callback de estado só alcança o ref */
  const marcarDoOperador = (v: boolean) => {
    abertoPeloOperadorRef.current = v
    setAbertoPeloOperador(v)
  }

  /**
   * Latch do anúncio do embed. Precisa ser um ouvinte de VIDA LONGA, não uma corrida por tentativa:
   * `dialerInitialized` é postado UMA vez por carregamento do iframe e nada no SDK o re-solicita.
   * Com escuta por tentativa, um anúncio que chegasse 1 s depois do teto era perdido para sempre, e
   * toda tentativa seguinte reaproveitava o mesmo iframe esperando um anúncio que nunca viria — o
   * discador ficava inutilizável, com a mensagem mandando "tente de novo".
   *
   * Fica no mount: o anúncio pode chegar antes de qualquer `await` nosso.
   */
  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      const d = e.data as { source?: unknown; type?: unknown } | null | undefined
      if (!d || typeof d !== 'object') return
      if (d.source !== 'n2p-dialer-embed' || d.type !== 'dialerInitialized') return
      prontoRef.current = true
      for (const avisar of aguardandoProntoRef.current) avisar(true)
      aguardandoProntoRef.current.clear()
    }
    window.addEventListener('message', ouvir)
    return () => window.removeEventListener('message', ouvir)
  }, [])

  useEffect(() => () => {
    limparTimer()
    // O construtor do SDK registra um listener de 'message' em window e só dispose() o remove
    // (dialer-sdk.es.js:45 e :388-391). Sem isso, cada visita à página deixaria um ouvinte órfão
    // chamando os setState de um provider já desmontado.
    dialerRef.current?.dispose()
    dialerRef.current = null
    prontoRef.current = false
    preparoRef.current = null
    vivasRef.current.clear()
  }, [])

  const aoMudarEstado = useCallback((info: N2pEstado) => {
    eventosRef.current += 1
    const chave = chaveDaChamada(info)
    if (info.estado === 'disconnected') vivasRef.current.delete(chave)
    else vivasRef.current.set(chave, info)

    const aindaFalando = vivasRef.current.size > 0
    setEmChamada(aindaFalando)
    // A barra descreve a perna DO PRÓPRIO EVENTO quando ela continua viva; se foi ela que morreu,
    // cai em outra perna viva. `values().next()` devolve a mais ANTIGA inserida — usá-la direto
    // fazia a barra narrar a chamada errada quando havia duas em curso.
    const doEvento = vivasRef.current.get(chave)
    const outraViva = vivasRef.current.values().next().value
    setEstado(aindaFalando ? (doEvento ?? outraViva ?? info) : info)

    if (aindaFalando) {
      setDesfecho(false)
      limparTimer()
      return
    }

    // Fim de verdade: nenhuma perna viva. O widget não tem mais função na tela — em repouso ele só
    // exibe LOGOUT e o seletor de origem. Sai de cena sozinho; fica a NOSSA barra com o desfecho
    // por alguns segundos (atendeu? quanto durou?) e depois ela sai também.
    //
    // Se o painel é do OPERADOR (ele abriu para logar ou trocar o Call From), o fim de uma chamada
    // qualquer não pode mexer nele: nem fechar, nem colapsar para a faixa compacta — isso arrancaria
    // o Login e o Call From de baixo do cursor no meio do ajuste. Lido por ref porque este callback
    // tem deps [] e não vê o state.
    const doOperador = abertoPeloOperadorRef.current
    setEmUso(false)
    setMinimizado(false)
    setAmpliado(doOperador)
    setDesfecho(true)
    limparTimer()
    timerDesfecho.current = setTimeout(() => {
      setDesfecho(false)
      // limpa o estado junto: senão a barra, ao reaparecer por outro motivo, exibiria o desfecho
      // de uma chamada antiga colado na instrução de login.
      setEstado(null)
    }, SEGUNDOS_DESFECHO * 1000)
  }, [])

  /** Resolve quando o latch marca que o embed anunciou, ou false no teto de espera. */
  const esperarPronto = useCallback((ms: number) => new Promise<boolean>((resolve) => {
    if (prontoRef.current) {
      resolve(true)
      return
    }
    let feito = false
    const encerrar = (ok: boolean) => {
      if (feito) return
      feito = true
      clearTimeout(timer)
      aguardandoProntoRef.current.delete(encerrar)
      resolve(ok)
    }
    aguardandoProntoRef.current.add(encerrar)
    const timer = setTimeout(() => encerrar(false), ms)
  }), [])

  const garantirDialer = useCallback(async (): Promise<N2pDialer> => {
    if (dialerRef.current && prontoRef.current) return dialerRef.current
    if (!preparoRef.current) {
      preparoRef.current = (async () => {
        try {
          let d = dialerRef.current
          if (!d) {
            if (!containerRef.current) throw new Error('O discador ainda não está pronto na tela.')
            d = await N2pDialer.criar({ container: containerRef.current, aoMudarEstado })
            dialerRef.current = d
          }
          if (!(await esperarPronto(MS_EMBED_PRONTO))) {
            // Não deixamos o placeCall sair: ele ficaria 30 s pendurado e voltaria como "você não
            // está autenticado", diagnóstico falso.
            //
            // E descartamos o iframe que não anunciou: o embed anuncia UMA vez por carregamento, então
            // reaproveitá-lo faria toda tentativa seguinte esperar um anúncio que nunca vem — o
            // discador travado até trocar de tela, com a mensagem mandando tentar de novo. Assim
            // "tente de novo" passa a ser verdade. Seguro: sem anúncio nunca houve chamada, e
            // conferimos o mapa de pernas vivas antes de arrancar o iframe.
            if (vivasRef.current.size === 0) {
              dialerRef.current?.dispose()
              dialerRef.current = null
            }
            throw new Error('O discador não terminou de carregar. Verifique a conexão e tente de novo.')
          }
          return d
        } finally {
          preparoRef.current = null
        }
      })()
    }
    return preparoRef.current
  }, [aoMudarEstado, esperarPronto])

  const ligar = useCallback(async (numero: string): Promise<string | null> => {
    // normaliza com a NOSSA função (o kit não tira o zero do DDD) e monta E.164
    const d = digitosFone(numero)
    if (!foneValido(d)) {
      return 'Número sem DDD válido — não é possível ligar por aqui.'
    }
    const eventosAntes = eventosRef.current
    /**
     * `placeCall` só resolve quando a resposta do iframe chega, e o SDK espera até 30 s
     * (dialer-sdk.es.js:327) — enquanto as notificações de estado vêm por outro caminho. Ou seja: a
     * chamada pode nascer, ser atendida e terminar ANTES desta promise voltar. Quando isso
     * acontece, mexer na visibilidade aqui traria o widget de volta para uma chamada que já morreu.
     */
    const cicloJaTerminou = () => eventosRef.current !== eventosAntes && vivasRef.current.size === 0

    setChamando(true)
    setPreparando(true)
    setDesfecho(false)
    setEstado(null)
    limparTimer()
    try {
      const dialer = await garantirDialer()
      setPreparando(false)
      await dialer.ligarPara(`55${d}`)
      if (cicloJaTerminou()) return null
      // painel aberto para o operador ver o estado e alcançar o desligar. Sai sozinho quando não
      // sobra nenhuma chamada viva — antes ficava aberto para sempre e o widget virava mobília.
      setMinimizado(false)
      setEmUso(true)
      // a partir daqui o painel pertence à chamada, não ao ajuste que o operador estivesse fazendo
      marcarDoOperador(false)
      return null
    } catch (e: unknown) {
      const err = e as { codigo?: string; message?: string; dica?: string | null }
      const mensagem = [err.message ?? 'Falha ao ligar', err.dica].filter(Boolean).join(' ')
      // sem sessão: o login é feito DENTRO do widget, então abrimos o painel — e ampliado, porque o
      // botão de Login fica abaixo da faixa compacta. Nos outros erros (microfone, número, embed que
      // não carregou) não há nada a fazer ali, e NÃO baixamos visibilidade que outro fluxo criou.
      const precisaDoWidget = err.codigo === 'sem_sessao' || err.codigo === 'nao_iniciado'
      if (precisaDoWidget) {
        setEmUso(true)
        setMinimizado(false)
        setAmpliado(true)
      }
      return mensagem
    } finally {
      setChamando(false)
      setPreparando(false)
    }
  }, [garantirDialer])

  const abrirPainel = useCallback(async (): Promise<string | null> => {
    setDesfecho(false)
    // só apaga a narração se não há nada em curso: com uma chamada viva, zerar aqui faria a barra
    // parar de dizer "em ligação"/"recebendo chamada" e passar a instruir a ação errada
    if (vivasRef.current.size === 0) setEstado(null)
    limparTimer()
    setMinimizado(false)
    // O que interessa no widget aqui é o Login e o seletor Call From, e os dois ficam abaixo da faixa
    // compacta. Ampliar não esconde nada — o card da chamada e o botão de desligar ficam na faixa de
    // topo — então vale mesmo com chamada em curso.
    setAmpliado(true)
    marcarDoOperador(true)
    setPreparando(true)
    try {
      // O iframe nasce aqui e só devolvemos depois do anúncio do embed. Sem isso o painel abria com
      // 600 px de nada: nenhum Login, nenhum Call From — falhando exatamente nos dois casos que
      // justificam este botão.
      await garantirDialer()
      return null
    } catch (e: unknown) {
      const err = e as { message?: string; dica?: string | null }
      // não há widget para mostrar (o iframe foi descartado ou nunca subiu): não deixamos um card
      // vazio na tela. Se houver chamada viva, `aberto` continua true por ela e nada é escondido.
      marcarDoOperador(false)
      return [err.message ?? 'Não foi possível abrir o discador', err.dica].filter(Boolean).join(' ')
    } finally {
      setPreparando(false)
    }
  }, [garantirDialer])

  const aberto = emChamada || emUso || abertoPeloOperador
  const mostrarWidget = aberto && !minimizado
  const mostrarBarra = aberto || desfecho
  const entrante = estado?.direcao === 'inbound'

  const fechar = () => {
    setAmpliado(false)
    // O X sempre significa "não quero este painel", então o pedido do operador é limpo nos dois
    // ramos — senão, um painel que ele abriu para ajustar o Call From voltava sozinho à tela quando
    // a chamada terminasse.
    marcarDoOperador(false)
    // Durante a chamada, fechar de verdade tiraria da tela o ÚNICO botão de desligar que existe
    // (o SDK não tem hangup). Então aqui o X recolhe, e a barra mantém como voltar.
    if (emChamada) setMinimizado(true)
    else {
      setEmUso(false)
      setDesfecho(false)
      setEstado(null)
      limparTimer()
    }
  }

  const painel = (
    <div
      className="fixed overflow-hidden rounded-lg border shadow-lg"
      style={
        mostrarBarra
          ? {
              bottom: '0.75rem', right: '0.75rem', zIndex: 60, pointerEvents: 'auto',
              // no modo ampliado a barra de rolagem precisa de calha própria, senão ela come a
              // largura do iframe (que é fixa em 393px, imposta pelo fornecedor) e corta a borda
              // direita do widget — com overflowX escondido, o que sai da vista fica inalcançável
              width: LARGURA_PAINEL + (ampliado ? CALHA_ROLAGEM : 0),
              borderColor: 'var(--border)', background: 'var(--card)',
            }
          : { left: -9999, top: -9999, width: LARGURA_PAINEL, zIndex: 60, pointerEvents: 'auto', visibility: 'hidden' }
      }
    >
      {mostrarBarra && (
        <>
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              {emChamada ? <Phone className="h-3.5 w-3.5 text-primary" /> : <PhoneOff className="h-3.5 w-3.5 text-muted-foreground" />}
              Discador
              <span className="font-normal text-muted-foreground">
                {preparando && '· abrindo…'}
                {!preparando && estado?.estado === 'connecting' && (entrante ? '· recebendo chamada' : '· chamando…')}
                {!preparando && estado?.estado === 'answered' && '· em ligação'}
                {/* o desfecho só vale dentro da janela de exibição: fora dela seria o resultado
                    de uma chamada antiga passando por estado atual */}
                {!preparando && desfecho && estado?.estado === 'disconnected' && (
                  estado.resultado === 'answered'
                    ? `· encerrada${estado.duracaoSegundos != null ? ` (${estado.duracaoSegundos}s)` : ''}`
                    : (entrante ? '· recebida perdida' : '· não atendeu')
                )}
              </span>
            </span>
            <span className="flex items-center gap-0.5">
              {minimizado ? (
                <button
                  type="button"
                  onClick={() => setMinimizado(false)}
                  className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-muted"
                >
                  Abrir para desligar
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setAmpliado((v) => !v)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                    title={ampliado ? 'Mostrar só a chamada' : 'Mostrar teclado, transferência e o número de origem'}
                  >
                    {ampliado ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={fechar}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                    title={emChamada ? 'Recolher — a ligação continua e o desligar volta em um clique' : 'Fechar'}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </span>
          </div>
          {aberto && (
            <p className="px-3 pb-1.5 pt-1.5 text-[10px] leading-snug text-muted-foreground">
              {emChamada
                ? (minimizado
                    ? 'A ligação continua. Use “Abrir para desligar”.'
                    : entrante
                      ? 'Chamada entrando — atenda no widget abaixo.'
                      : 'Para desligar, use o botão vermelho abaixo.')
                : (
                  <>
                    Entre com <b>Login</b>. Em <b>Call From</b>, escolha o número que aparece no
                    celular do motorista.
                  </>
                )}
            </p>
          )}
        </>
      )}

      {/*
        Altura 0 esconde o widget sem desmontar nem tocar no style do iframe (que o fornecedor
        reescreve a cada init). O div interno NÃO fixa tamanho de propósito: o iframe se dimensiona
        sozinho pelo `containerStyle` que vem do embed — repetir 393x600 aqui daria a impressão
        falsa de que controlamos isso.

        Rolagem só na vertical, e só no modo ampliado: 70vh corta o rodapé do widget num notebook de
        768 px de altura, e é justamente lá que ficam o teclado, a transferência e o Call From — tudo
        que o ampliar existe para revelar. Conteúdo cross-origin não rola por fora. Na horizontal
        `hidden` sempre, senão a diferença entre a largura do iframe e a do card renderia uma barra
        horizontal permanente comendo altura útil.
      */}
      <div
        className="panel-scroll"
        style={{
          height: mostrarWidget ? (ampliado ? ALTURA_AMPLIADA : ALTURA_COMPACTA) : 0,
          maxHeight: '70vh',
          overflowY: ampliado ? 'auto' : 'hidden',
          overflowX: 'hidden',
        }}
      >
        <div ref={containerRef} />
      </div>
    </div>
  )

  return (
    <Ctx.Provider value={{ ligar, abrirPainel, chamando, emChamada, estado }}>
      {children}
      {/*
        Portal para o body — obrigatório, ver o cabeçalho: dentro da árvore da página o painel fica
        preso no stacking context do AppLayout e o overlay do diálogo pinta por cima, deixando o
        botão de desligar inerte. O alvo é constante, então o React reusa o mesmo nó entre renders e
        o iframe (com a sessão e a ligação dentro) nunca é remontado.
      */}
      {createPortal(painel, document.body)}
    </Ctx.Provider>
  )
}
