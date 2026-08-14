// Normalizacao de numero compartilhada entre o CLI e a interface web.
// Fica em um modulo unico de proposito: se as duas validacoes divergirem,
// a UI aceita algo que o CLI recusa (ou vice-versa) e alguem liga errado.

export class PhoneError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

/**
 * A API V2 exige E.164 SEM o "+". Aceitamos o que a pessoa naturalmente
 * digita e normalizamos, mas nunca adivinhamos um codigo de pais ausente:
 * "11987654321" poderia ser Brasil (11) ou EUA (+1), e errar isso liga para
 * a pessoa errada.
 *
 * @returns {{value: string, kind: 'e164'|'ramal', explicitIntl: boolean, warning: string|null}}
 */
export function normalize(raw, { forceExt = false, label = 'Destino' } = {}) {
  // \s cobre tab e newline;   e o NBSP que vem colado em copiar-e-colar.
  const cleaned = String(raw ?? '').replace(/[\s ()\-.]/g, '');

  if (cleaned === '') {
    throw new PhoneError(`${label} vazio.`, 'Informe um numero.');
  }
  if (!/^\+?[0-9]+$/.test(cleaned)) {
    throw new PhoneError(
      `${label} invalido: "${raw}"`,
      'Use apenas digitos ASCII, com + opcional. Ex: 5511987654321 ou "+55 11 98765-4321"',
    );
  }

  const hadPlus = cleaned.startsWith('+');
  let digits = cleaned.replace(/^\+/, '');
  let explicitIntl = hadPlus;

  // Prefixo internacional discado (00) equivale ao "+".
  if (!hadPlus && digits.startsWith('00')) {
    digits = digits.slice(2);
    explicitIntl = true;
  }

  if (forceExt) {
    if (digits.length > 6) {
      throw new PhoneError(`Ramal invalido: "${raw}"`, 'Ramais tem no maximo 6 digitos.');
    }
    return { value: digits, kind: 'ramal', explicitIntl, warning: null };
  }

  // E.164 tem no minimo 8 digitos; abaixo disso so pode ser ramal interno.
  if (digits.length <= 6) {
    return { value: digits, kind: 'ramal', explicitIntl, warning: null };
  }

  if (digits.length < 8 || digits.length > 15) {
    throw new PhoneError(
      `${label} fora do padrao E.164: "${raw}" (${digits.length} digitos)`,
      'E.164 tem de 8 a 15 digitos incluindo o codigo do pais. Para ramal, marque a opcao de ramal.',
    );
  }

  // Faixa ambigua: sem "+" nem "00" e curto o suficiente para ser um numero
  // nacional sem codigo de pais. Nao bloqueamos, mas avisamos.
  const warning = !explicitIntl && digits.length <= 11
    ? `"${digits}" tem ${digits.length} digitos e sem "+". Se o codigo do pais estiver faltando, ` +
      'o numero discado sera outro. No Brasil o formato completo tem 12 ou 13 digitos: 55 + DDD + numero.'
    : null;

  return { value: digits, kind: 'e164', explicitIntl, warning };
}

/**
 * Formatacao para leitura humana. Nunca inventa um "+" que a pessoa nao
 * digitou: exibir "7139950715" como "+7139950715" sugeriria Russia (+7)
 * quando a API vai tratar como numero nacional brasileiro.
 */
export function pretty(d) {
  if (d.kind === 'ramal') return `ramal ${d.value}`;
  const n = d.value;
  if (n.startsWith('55') && (n.length === 12 || n.length === 13)) {
    return `+55 (${n.slice(2, 4)}) ${n.slice(4, -4)}-${n.slice(-4)}`;
  }
  if (d.explicitIntl && n.startsWith('1') && n.length === 11) {
    return `+1 (${n.slice(1, 4)}) ${n.slice(4, 7)}-${n.slice(7)}`;
  }
  if (d.explicitIntl) return `+${n}`;
  return n; // formato nacional; quem resolve o pais e a operadora
}

/**
 * Rotulo curto do tipo, para a UI. Baseia-se no que pretty() conseguiu
 * atribuir, nao em ter digitado "+": "5571996051180" e E.164 completo
 * mesmo sem o "+", porque o 55 esta ali.
 */
export function kindLabel(d) {
  if (d.kind === 'ramal') return 'ramal interno';
  if (pretty(d).startsWith('+')) return 'E.164 com codigo de pais';
  return 'formato nacional, sem codigo de pais';
}

/**
 * Numero como um softphone SIP (Dialer SDK / JsSIP) deve discar.
 *
 * A V2 REST exige E.164 SEM "+" e normaliza formato nacional sozinha; o
 * softphone manda o INVITE direto, entao o "+" importa. Regra: so prefixa
 * quando o codigo do pais e conhecido. Prefixar um numero nacional seria
 * inventar pais — "7139950715" viraria +7 (Russia) em vez do dialplan local.
 *
 * Existe aqui, e nao na pagina, porque decidir isso no cliente comparando
 * rotulos legiveis ja produziu exatamente esse bug.
 */
export function toDialString(d) {
  if (d.kind === 'ramal') return d.value;
  return pretty(d).startsWith('+') ? `+${d.value}` : d.value;
}
