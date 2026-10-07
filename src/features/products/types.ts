/** Producto tal como lo devuelve GET /products. */
export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  stock: number
  createdAt: string
}

/** Cuerpo de POST /products (CreateProductDto). */
export interface CreateProductInput {
  name: string
  description?: string
  price: number
  stock: number
}

/** Valores del formulario: los campos numéricos se capturan como texto y se convierten al enviar. */
export type ProductFormValues = {
  name: string
  description: string
  price: string
  stock: string
}
