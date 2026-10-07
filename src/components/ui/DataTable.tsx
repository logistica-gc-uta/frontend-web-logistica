import type { ReactNode } from 'react'

export interface Column<T> {
  header: string
  render: (row: T) => ReactNode
}

interface DataTableProps<T> {
  /** Descripción accesible de la tabla. */
  caption: string
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  emptyMessage?: string
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  emptyMessage = 'No hay registros para mostrar',
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td key={column.header}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
