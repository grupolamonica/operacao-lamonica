// Tipos para o kit net2phone copiado de grupolamonica/net2phone (integracao/).
//
// Os três arquivos .js/.mjs vêm do repositório do fornecedor da integração e são mantidos
// SEM MODIFICAÇÃO — atualizar = copiar de novo de lá. Este .d.ts existe porque o tsconfig do
// front não tem allowJs; ele descreve só o que a tela usa.
//
// ⚠️ O widget é um iframe 393x600 que precisa existir no DOM e NÃO pode ser removido: é nele
// que o operador faz login, atende chamada recebida e desliga (o SDK não expõe hangup por
// código). Esconder por CSS, nunca desmontar.

declare module '@/lib/net2phone/n2p-dialer.js' {
  export type N2pCodigoErro =
    | 'sem_sessao'
    | 'microfone'
    | 'ocupado'
    | 'numero'
    | 'nao_iniciado'
    | 'desconhecido'

  export class N2pDialerError extends Error {
    codigo: N2pCodigoErro
    /** texto pronto para mostrar ao operador dizendo o que fazer */
    dica: string | null
  }

  export interface N2pEstado {
    /** connecting | answered | disconnected */
    estado: string
    /** inbound | outbound */
    direcao: string
    numero: string | null
    /** answered | not_answered */
    resultado: string | null
    duracaoSegundos: number | null
    chamada: unknown
  }

  export interface N2pConferencia {
    valido: boolean
    discado?: string
    exibicao?: string
    erro?: string
    dica?: string
  }

  export class N2pDialer {
    static criar(opts: {
      container: HTMLElement
      aoMudarEstado?: (info: N2pEstado) => void
      urlIframe?: string | null
    }): Promise<N2pDialer>

    static conferirNumero(numero: string, opts?: { ramal?: boolean }): N2pConferencia

    /** Origina a chamada. Lança N2pDialerError com .codigo acionável. */
    ligarPara(numero: string, opts?: { ramal?: boolean }): Promise<{ discado: string; exibicao: string }>

    /** Descobre se a sessão está válida SEM originar chamada. */
    conferirSessao(): Promise<boolean>

    aoMudarEstado(fn: (info: N2pEstado) => void): () => void

    descartar?(): void
  }

  export default N2pDialer
}
