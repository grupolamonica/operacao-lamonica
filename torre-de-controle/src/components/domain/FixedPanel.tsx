interface Props {
  width?: number
  children: React.ReactNode
}

/**
 * Painel flutuante fixo na lateral direita da viewport.
 * Alinhado com o px-6 do AppLayout (right: 24px).
 * Todos os painéis de detalhe (Alertas, Viagens, Motoristas) usam este primitivo.
 */
export function FixedPanel({ width = 400, children }: Props) {
  return (
    <div
      className="fixed flex flex-col z-30"
      style={{
        top: '16px',
        right: '24px',
        width: `${width}px`,
        height: 'calc(100vh - 2rem)',
      }}
    >
      {children}
    </div>
  )
}
