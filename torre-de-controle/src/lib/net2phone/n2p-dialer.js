// Wrapper do net2phone Dialer SDK para embutir em aplicacao web propria.
//
// PARA QUE SERVE: seu sistema tem um botao "Ligar" ao lado de um contato. O
// numero ja esta nos seus dados — ninguem digita nada. Ao clicar, a ligacao
// sai pelo navegador do usuario via WebRTC: nenhum ramal toca, o audio passa
// pelo microfone e fone do computador dele.
//
// ARQUITETURA: seu site pode ser servido de uma VPS; isso nao importa. O que
// importa e que a PAGINA roda no navegador do usuario, e e la que o softphone
// registra e o audio trafega. A VPS so entrega o HTML.
//
//   import { N2pDialer } from './n2p-dialer.js';
//
//   const dialer = await N2pDialer.criar({
//     container: document.getElementById('n2p-widget'),
//     aoMudarEstado: (info) => console.log(info.estado, info.numero),
//   });
//
//   document.querySelector('#btn').onclick = () => dialer.ligarPara('5571996051180');
//
import Net2PhoneDialer from './dialer-sdk.es.js';
import { normalize, pretty, toDialString, kindLabel, PhoneError } from './phone.mjs';

/** Erro com mensagem pronta para mostrar ao usuario final. */
export class N2pDialerError extends Error {
  constructor(codigo, mensagem, dica) {
    super(mensagem);
    this.codigo = codigo;   // 'sem_sessao' | 'microfone' | 'ocupado' | 'numero' | 'nao_iniciado' | 'desconhecido'
    this.dica = dica ?? null;
  }
}

const MENSAGENS = {
  sem_sessao: {
    msg: 'Você não está autenticado no discador.',
    dica: 'Clique em Login no painel do discador e entre com seu usuário net2phone.',
  },
  microfone: {
    msg: 'Permissão de microfone negada.',
    dica: 'Libere o microfone para este site nas configurações do navegador e recarregue.',
  },
  ocupado: {
    msg: 'Já existe uma chamada de saída em andamento.',
    dica: 'Encerre a chamada atual no painel do discador antes de originar outra.',
  },
  numero: {
    msg: 'O discador rejeitou o número.',
    dica: 'Confira o número: precisa estar em E.164 com código do país, ou ser um ramal interno.',
  },
  nao_iniciado: {
    msg: 'O discador não foi iniciado.',
    dica: 'Verifique o console: o iframe pode ter sido bloqueado por CSP (frame-src).',
  },
};

export class N2pDialer {
  #sdk = null;
  #ouvintes = new Set();
  #chamadaAtual = null;
  #autenticado = null;   // null = ainda nao sondado
  #descartado = false;

  /**
   * @param {HTMLElement} container onde o widget (iframe 393x600) e renderizado.
   *        Precisa existir no DOM. Pode ficar dentro de um painel recolhivel —
   *        mas NAO pode ser removido: e nele que o usuario faz login, atende
   *        chamadas recebidas e desliga (o SDK nao expoe hangup por codigo).
   * @param {(info) => void} [aoMudarEstado] recebe {estado, numero, resultado,
   *        duracaoSegundos, chamada} a cada transicao.
   * @param {string} [urlIframe] sobrescreve a origem do embed (raramente usado).
   */
  static async criar({ container, aoMudarEstado, urlIframe = null } = {}) {
    if (!container || !(container instanceof HTMLElement)) {
      throw new N2pDialerError('nao_iniciado', 'É preciso passar um container (HTMLElement) para o widget.');
    }
    const inst = new N2pDialer();
    try {
      inst.#sdk = new Net2PhoneDialer({
        rootHtmlElement: container,
        ...(urlIframe ? { iFrameSourceUrl: urlIframe } : {}),
      });
    } catch (e) {
      throw new N2pDialerError('nao_iniciado', MENSAGENS.nao_iniciado.msg, `${MENSAGENS.nao_iniciado.dica} (${e.message})`);
    }
    if (aoMudarEstado) inst.aoMudarEstado(aoMudarEstado);

    inst.#sdk.subscribe((ev) => {
      const c = ev.call;
      inst.#chamadaAtual = c.state === 'disconnected' ? null : c;
      const info = {
        estado: c.state,                     // connecting | answered | disconnected
        direcao: c.direction,                // inbound | outbound
        numero: c.to || c.from || null,
        resultado: c.result ?? null,         // answered | not_answered
        duracaoSegundos: (c.answer_time && c.end_time)
          ? Math.max(0, Math.round((new Date(c.end_time) - new Date(c.answer_time)) / 1000))
          : null,
        chamada: c,
      };
      for (const fn of inst.#ouvintes) {
        try { fn(info); } catch (e) { console.error('[n2p] ouvinte falhou:', e); }
      }
    });

    return inst;
  }

  /** Registra um ouvinte de mudanca de estado. Devolve funcao para remover. */
  aoMudarEstado(fn) {
    this.#ouvintes.add(fn);
    return () => this.#ouvintes.delete(fn);
  }

  /** Ha chamada em andamento? */
  get emChamada() { return this.#chamadaAtual !== null; }

  /** true | false | null (ainda nao sondado). */
  get autenticado() { return this.#autenticado; }

  /**
   * Normaliza um numero sem discar. Util para mostrar ao usuario o que sera
   * discado, e para validar dados do seu cadastro em lote.
   * @returns {{valido: boolean, exibicao?: string, discado?: string, tipo?: string,
   *            aviso?: string|null, erro?: string, dica?: string}}
   */
  static conferirNumero(numero, { ramal = false } = {}) {
    try {
      const d = normalize(numero, { forceExt: ramal });
      return {
        valido: true,
        exibicao: pretty(d),
        discado: toDialString(d),
        tipo: kindLabel(d),
        aviso: d.warning,
      };
    } catch (e) {
      if (e instanceof PhoneError) return { valido: false, erro: e.message, dica: e.hint };
      throw e;
    }
  }

  /**
   * Origina a ligacao. O numero vem dos SEUS dados — o usuario nao digita.
   *
   * O "+" so e adicionado quando o codigo do pais e conhecido: prefixar um
   * numero nacional inventaria pais ("7139950715" viraria +7, Russia). Ver
   * toDialString() em phone.mjs.
   *
   * @throws {N2pDialerError} com .codigo acionavel.
   */
  async ligarPara(numero, { ramal = false } = {}) {
    if (this.#descartado) throw new N2pDialerError('nao_iniciado', 'Este discador já foi descartado.');
    if (!this.#sdk) throw new N2pDialerError('nao_iniciado', MENSAGENS.nao_iniciado.msg, MENSAGENS.nao_iniciado.dica);

    const conf = N2pDialer.conferirNumero(numero, { ramal });
    if (!conf.valido) throw new N2pDialerError('numero', conf.erro, conf.dica);

    try {
      await this.#sdk.placeCall({ to: conf.discado });
      this.#autenticado = true;
      return { discado: conf.discado, exibicao: conf.exibicao };
    } catch (e) {
      throw this.#traduzir(e);
    }
  }

  /**
   * Descobre se a sessao esta valida SEM originar chamada.
   *
   * O SDK valida autenticacao ANTES do numero, entao um valor que nao e numero
   * distingue os casos: AuthenticationError = sem sessao, InvalidPhoneNumberError
   * = autenticado. Numa aba sem sessao o iframe nao responde e o SDK estoura
   * TimeoutError depois de ~30s — tratamos como sem sessao.
   *
   * Chame ao carregar a tela para habilitar/desabilitar os botoes de ligar.
   */
  async conferirSessao() {
    if (!this.#sdk) return false;
    try {
      await this.#sdk.placeCall({ to: 'nao-e-um-numero' });
      this.#autenticado = true;
    } catch (e) {
      const E = Net2PhoneDialer.errors;
      this.#autenticado = e instanceof E.InvalidPhoneNumberError;
    }
    return this.#autenticado;
  }

  #traduzir(e) {
    const E = Net2PhoneDialer.errors;
    let codigo = 'desconhecido';
    if (e instanceof E.AuthenticationError) { codigo = 'sem_sessao'; this.#autenticado = false; }
    else if (e instanceof E.MicrophonePermissionError) codigo = 'microfone';
    else if (e instanceof E.OutgoingCallAlreadyRingingError) codigo = 'ocupado';
    else if (e instanceof E.InvalidPhoneNumberError) codigo = 'numero';
    else if (/timed out/i.test(String(e?.message))) { codigo = 'sem_sessao'; this.#autenticado = false; }

    const m = MENSAGENS[codigo];
    return new N2pDialerError(codigo, m?.msg ?? String(e?.message ?? e), m?.dica);
  }

  dispose() {
    this.#descartado = true;
    this.#ouvintes.clear();
    try { this.#sdk?.dispose(); } catch { /* ja descartado */ }
    this.#sdk = null;
  }
}

export { PhoneError };
export default N2pDialer;
