import { Link } from 'react-router'
import { paths } from '../../../app/paths'
import { AsyncContent } from '../../../components/ui/AsyncContent'
import { useFetch } from '../../../hooks/useFetch'
import { CategoryCard } from '../components/CategoryCard'
import { ProductCard } from '../components/ProductCard'
import { shopService } from '../shopService'

/** Regalos de la portada: los destacados van primero en el orden `featured` de la API. */
const loadHighlights = () => shopService.products({ page: 1, pageSize: 8, sort: 'featured' })

export function ShopHomePage() {
  const categories = useFetch(shopService.categories, 'No se pudieron cargar las categorías')
  const highlights = useFetch(loadHighlights, 'No se pudieron cargar los regalos')

  return (
    <div className="shop-page">
      <section className="shop-hero" aria-labelledby="shop-hero-title">
        <h1 id="shop-hero-title">Regalos para cada ocasión</h1>
        <p>Elige un regalo, nosotros lo entregamos. El envío ya está incluido en el precio.</p>
        <Link to={paths.shopCatalog} className="btn btn--primary">
          Ver regalos
        </Link>
      </section>

      <section aria-labelledby="shop-categories-title">
        <h2 id="shop-categories-title">Categorías y ocasiones</h2>
        <AsyncContent
          {...categories}
          onRetry={categories.reload}
          loadingText="Cargando categorías..."
        >
          {(items) => {
            // Solo categorías con regalos publicados: nada de ocasiones vacías.
            const withProducts = items.filter((category) => category.productCount > 0)
            return withProducts.length === 0 ? (
              <p className="empty-state">Todavía no hay categorías con regalos publicados.</p>
            ) : (
              <ul className="category-grid">
                {withProducts.map((category) => (
                  <li key={category.id}>
                    <CategoryCard category={category} />
                  </li>
                ))}
              </ul>
            )
          }}
        </AsyncContent>
      </section>

      <section aria-labelledby="shop-highlights-title">
        <AsyncContent {...highlights} onRetry={highlights.reload} loadingText="Cargando regalos...">
          {({ items }) => {
            const featured = items.filter((product) => product.isFeatured)
            const shown = featured.length > 0 ? featured : items
            return (
              <>
                <h2 id="shop-highlights-title">
                  {featured.length > 0 ? 'Destacados' : 'Regalos disponibles'}
                </h2>
                {shown.length === 0 ? (
                  <p className="empty-state">Todavía no hay regalos publicados.</p>
                ) : (
                  <ul className="product-grid">
                    {shown.map((product) => (
                      <li key={product.id}>
                        <ProductCard product={product} />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )
          }}
        </AsyncContent>
      </section>
    </div>
  )
}
