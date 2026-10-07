import { useState } from 'react'
import { ResourcePage } from '../../components/layout/ResourcePage'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { useFetch } from '../../hooks/useFetch'
import { formatCurrency } from '../../lib/format/formatCurrency'
import { ProductForm } from './ProductForm'
import { productsService } from './productsService'
import type { Product } from './types'

const COLUMNS: Column<Product>[] = [
  { header: 'Nombre', render: (product) => product.name },
  { header: 'Descripción', render: (product) => product.description || '—' },
  { header: 'Precio', render: (product) => formatCurrency(product.price) },
  { header: 'Stock', render: (product) => product.stock },
]

export function ProductsPage() {
  const products = useFetch(productsService.list, 'No se pudieron cargar los productos')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleCreated = (product: Product) => {
    setSuccessMessage(`Producto "${product.name}" creado correctamente`)
    products.reload()
  }

  return (
    <ResourcePage
      title="Productos"
      description="Catálogo de productos disponibles para los pedidos. Solo se listan los productos con stock."
      formTitle="Nuevo producto"
      form={<ProductForm onCreated={handleCreated} />}
      listTitle="Productos disponibles"
      successMessage={successMessage}
    >
      <AsyncContent {...products} onRetry={products.reload} loadingText="Cargando productos...">
        {(data) => (
          <DataTable
            caption="Productos disponibles"
            columns={COLUMNS}
            rows={data}
            getRowKey={(product) => product.id}
            emptyMessage="No hay productos con stock disponible"
          />
        )}
      </AsyncContent>
    </ResourcePage>
  )
}
