interface Props {
  width?: number
  children: React.ReactNode
}

/**
 * Painel lateral reutilizável: sticky — desce junto com a página até o nível
 * da tabela, depois trava no topo. O próprio wrapper tem overflow-y: auto para
 * que o conteúdo interno seja rolável sem comprometer o layout da página.
 * Usado em Alertas, Viagens e Motoristas via FixedPanel.
 */
export function FixedPanel({ width = 400, children }: Props) {
  return (
    <div
      className="shrink-0 panel-scroll"
      style={{
        position: 'sticky',
        top: '16px',
        alignSelf: 'flex-start',
        width: `${width}px`,
        maxHeight: 'calc(100vh - 2rem)',
        overflowY: 'auto',
      }}
    >
      {children}
    </div>
  )
}
