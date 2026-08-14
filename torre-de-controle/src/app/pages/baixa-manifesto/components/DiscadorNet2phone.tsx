import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Phone, PhoneOff, X } from 'lucide-react'
import { N2pDialer, type N2pEstado } from '@/lib/net2phone/n2p-dialer.js'
import { digitosFone, foneValido } from '@/lib/telefone'

/**
 * Discador net2phone embutido na tela — ligar pelo navegador, sem sair do painel.
 *
 * Kit vindo de grupolamonica/net2phone (integracao/): a ligação sai por WebRTC do navegador do
 * OPERADOR, com áudio no headset dele. Nada toca do lado dele; o motorista recebe direto. A VPS
 * só entrega o HTML — quem registra o softphone é o navegador.
 *
 * ⚠️ DUAS RESTRIÇÕES DO SDK QUE MOLDAM ESTE COMPONENTE:
 *
 * 1. O widget é um iframe 393x600 que precisa existir no DOM e NÃO PODE SER REMOVIDO — é nele que
 *    o operador faz login, atende chamada recebida e DESLIGA (o SDK não expõe hangup por código).
 *    Por isso o container é montado uma vez e apenas escondido por CSS quando recolhido. Trocar
 *    para renderização condicional quebraria a ligação em curso.
 *
 * 2. `conferirSessao()` demora ~30 s quando não há sessão (o iframe não responde e o SDK estoura
 *    timeout). Então NÃO sondamos no carregamento: criamos o discador no primeiro clique e, se vier
 *    'sem_sessao', abrimos o painel com a instrução de login.
 *
 * ⚠️ NORMALIZAÇÃO: o phone.mjs do kit NÃO remove o zero do DDD — "(081)98633-6617" viraria
 * "081986336617" (testado). É o mesmo defeito que o `tel:` da tela tinha. Por isso passamos por
 * digitosFone() e prefixamos 55, caindo no caminho E.164 do kit.
 */

interface DiscadorApi {
  /** Origina a chamada. Devolve mensagem de erro pronta para exibir, ou null em caso de sucesso. */
  ligar: (numero: string) => Promise<string | null>
  chamando: boolean
  estado: N2pEstado | null
  abrirPainel: () => void
}

const Ctx = createContext<DiscadorApi | null>(null)

/** Disponível apenas dentro do DiscadorNet2phoneProvider; fora dele devolve null. */
export function useDiscador(): DiscadorApi | null {
  return useContext(Ctx)
}

export function DiscadorNet2phoneProvider({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dialerRef = useRef<N2pDialer | null>(null)
  const [aberto, setAberto] = useState(false)
  const [chamando, setChamando] = useState(false)
  const [estado, setEstado] = useState<N2pEstado | null>(null)

  const garantirDialer = useCallback(async () => {
    if (dialerRef.current) return dialerRef.current
    if (!containerRef.current) throw new Error('container do discador ainda não montou')
    dialerRef.current = await N2pDialer.criar({
      container: containerRef.current,
      aoMudarEstado: (info) => setEstado(info),
    })
    return dialerRef.current
  }, [])

  const ligar = useCallback(async (numero: string): Promise<string | null> => {
    // normaliza com a NOSSA função (o kit não tira o zero do DDD) e monta E.164
    const d = digitosFone(numero)
    if (!foneValido(d)) {
      return 'Número sem DDD válido — não é possível ligar por aqui.'
    }
    setChamando(true)
    try {
      const dialer = await garantirDialer()
      await dialer.ligarPara(`55${d}`)
      setAberto(true) // painel aberto para o operador ver o estado e poder desligar
      return null
    } catch (e: unknown) {
      const err = e as { codigo?: string; message?: string; dica?: string | null }
      // sem sessão: o login é feito DENTRO do widget, então abrimos o painel
      if (err.codigo === 'sem_sessao' || err.codigo === 'nao_iniciado') setAberto(true)
      return [err.message ?? 'Falha ao ligar', err.dica].filter(Boolean).join(' ')
    } finally {
      setChamando(false)
    }
  }, [garantirDialer])

  const emChamada = estado?.estado === 'connecting' || estado?.estado === 'answered'

  return (
    <Ctx.Provider value={{ ligar, chamando, estado, abrirPainel: () => setAberto(true) }}>
      {children}

      {/* Barra fixa: só aparece quando há algo a mostrar (painel aberto ou chamada em curso) */}
      {(aberto || emChamada) && (
        <div
          className="fixed bottom-3 right-3 z-50 rounded-lg border shadow-lg"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              {emChamada ? <Phone className="h-3.5 w-3.5 text-primary" /> : <PhoneOff className="h-3.5 w-3.5 text-muted-foreground" />}
              Discador
              {estado && (
                <span className="font-normal text-muted-foreground">
                  {estado.estado === 'connecting' && '· chamando…'}
                  {estado.estado === 'answered' && '· em ligação'}
                  {estado.estado === 'disconnected' && (
                    estado.resultado === 'answered'
                      ? `· encerrada${estado.duracaoSegundos != null ? ` (${estado.duracaoSegundos}s)` : ''}`
                      : '· não atendeu'
                  )}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
              title="Recolher (a ligação continua)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="px-3 pt-1.5 text-[10px] text-muted-foreground">
            Use o widget abaixo para <b>entrar</b> na primeira vez e para <b>desligar</b> a chamada.
          </p>
        </div>
      )}

      {/*
        O container do widget fica SEMPRE montado — remover do DOM mataria a sessão e a ligação em
        curso. Quando recolhido, sai de vista por posicionamento, não por desmontagem.
      */}
      <div
        className="fixed z-50"
        style={
          aberto || emChamada
            ? { bottom: '3rem', right: '0.75rem', width: 393, height: 600, maxHeight: '70vh', overflow: 'hidden' }
            : { width: 393, height: 600, left: -9999, top: -9999, visibility: 'hidden' }
        }
      >
        <div ref={containerRef} style={{ width: 393, height: 600 }} />
      </div>
    </Ctx.Provider>
  )
}
