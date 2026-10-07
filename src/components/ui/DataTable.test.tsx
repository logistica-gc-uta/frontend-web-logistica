import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DataTable, type Column } from './DataTable'

interface Item {
  id: string
  name: string
}

const columns: Column<Item>[] = [
  { header: 'ID', render: (item) => item.id },
  { header: 'Nombre', render: (item) => item.name },
]

describe('DataTable', () => {
  it('muestra los encabezados y una fila por registro', () => {
    render(
      <DataTable
        caption="Elementos"
        columns={columns}
        rows={[
          { id: '1', name: 'Uno' },
          { id: '2', name: 'Dos' },
        ]}
        getRowKey={(item) => item.id}
      />,
    )

    const table = screen.getByRole('table', { name: 'Elementos' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['ID', 'Nombre'])
    const [, ...rows] = within(table).getAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(within(rows[1]).getByText('Dos')).toBeInTheDocument()
  })

  it('muestra el mensaje de vacío cuando no hay registros', () => {
    render(
      <DataTable
        caption="Elementos"
        columns={columns}
        rows={[]}
        getRowKey={(item) => item.id}
        emptyMessage="Sin elementos"
      />,
    )

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Sin elementos')).toBeInTheDocument()
  })
})
