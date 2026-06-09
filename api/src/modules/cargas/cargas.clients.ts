/**
 * Mapa de clientes do Cargas → nome canônico na Torre (D-14, 14-CONTEXT.md).
 *
 * A tabela `clientes` do Cargas já guarda "Shopee" e "Nestle" por UUID, então o
 * resolver primário é por UUID (via mapa lido do banco). O alias por categoria
 * cobre o caso de a carga vir rotulada pela categoria (pedido do usuário:
 * E-COMMERCE = Shopee, Produtos Alimentícios = Nestlé).
 */

/** Alias categoria → nome de cliente (chave normalizada UPPER, sem acento). */
const CATEGORY_ALIAS: Record<string, string> = {
  'E-COMMERCE': 'Shopee',
  'ECOMMERCE': 'Shopee',
  'PRODUTOS ALIMENTICIOS': 'Nestlé',
}

// Faixa de diacríticos combinantes U+0300–U+036F, construída via escape ASCII
// para não embutir marcas combinantes literais no fonte.
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')

function normalize(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS, '').trim().toUpperCase()
}

/**
 * Resolve o nome do cliente a partir do `cliente_id` da carga.
 * `clientesById` é o mapa lido de `clientes` (id → nome). Aplica o alias de
 * categoria como fallback se o nome casar com uma categoria conhecida.
 */
export function resolveClientName(
  clienteId: string | null,
  clientesById: Map<string, string>,
): string | null {
  if (!clienteId) return null
  const raw = clientesById.get(clienteId) ?? null
  if (!raw) return null
  return CATEGORY_ALIAS[normalize(raw)] ?? raw
}
