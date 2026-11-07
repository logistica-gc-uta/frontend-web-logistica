import { Link } from 'react-router'
import { paths } from '../../../app/paths'
import { AsyncContent } from '../../../components/ui/AsyncContent'
import { useFetch } from '../../../hooks/useFetch'
import { CategoryCard } from '../components/CategoryCard'
import { ProductCard } from '../components/ProductCard'
import { formatCents } from '../money'
import { shopService } from '../shopService'
import type { ShopProduct } from '../types'

/** Regalos de la portada: los destacados van primero en el orden `featured` de la API. */
const loadHighlights = () => shopService.products({ page: 1, pageSize: 8, sort: 'featured' })

/** Ocasiones que se muestran en la portada; el resto está en el catálogo. */
const HOME_CATEGORIES = 8

/** Hasta tres regalos con foto para la composición del encabezado (decorativa). */
function HeroCollage({ products }: { products: readonly ShopProduct[] }) {
  const withPhoto = products.filter((product) => product.primaryImageUrl).slice(0, 3)
  if (withPhoto.length === 0) return null

  return (
    <div className={`hero-collage hero-collage--${withPhoto.length}`} aria-hidden="true">
      {withPhoto.map((product) => (
        <figure key={product.id} className="hero-collage__item">
          <img src={product.primaryImageUrl ?? ''} alt="" loading="eager" decoding="async" />
          <figcaption>
            <span className="hero-collage__name">{product.name}</span>
            <span className="hero-collage__price">{formatCents(product.priceCents)}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

const STEPS = [
  { title: 'Elige el regalo', text: 'Busca por ocasión o por precio y agrégalo al carrito.' },
  { title: 'Dinos dónde y cuándo', text: 'Marca la dirección en el mapa y la fecha de entrega.' },
  { title: 'Lo entregamos', text: 'Nuestro repartidor lo lleva. El envío ya está en el precio.' },
]

export function ShopHomePage() {
  const categories = useFetch(shopService.categories, 'No se pudieron cargar las categorías')
  const highlights = useFetch(loadHighlights, 'No se pudieron cargar los regalos')

  return (
    <div className="shop-page shop-home">
      <section className="shop-hero" aria-labelledby="shop-hero-title">
        <div className="shop-hero__copy">
          <h1 id="shop-hero-title">Regalos para cada ocasión</h1>
          <p>Elige un regalo, nosotros lo entregamos. El envío ya está incluido en el precio.</p>
          <div className="shop-hero__actions">
            <Link to={paths.shopCatalog} className="btn btn--primary">
              Ver regalos
            </Link>
            <a href="#shop-categories-title" className="shop-hero__secondary">
              Buscar por ocasión
            </a>
          </div>
        </div>
        {highlights.data && <HeroCollage products={highlights.data.items} />}
      </section>

      <section aria-labelledby="shop-categories-title" className="shop-section">
        <div className="shop-section__head">
          <h2 id="shop-categories-title">Categorías y ocasiones</h2>
          <Link to={paths.shopCatalog}>Ver todo el catálogo</Link>
        </div>
        <AsyncContent
          {...categories}
          onRetry={categories.reload}
          loadingText="Cargando categorías..."
        >
          {(items) => {
            // Solo categorías con regalos publicados, las de más regalos primero.
            const withProducts = items
              .filter((category) => category.productCount > 0)
              .sort((a, b) => b.productCount - a.productCount)
              .slice(0, HOME_CATEGORIES)
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

      <section className="shop-steps" aria-labelledby="shop-steps-title">
        <h2 id="shop-steps-title">Así de simple</h2>
        <ol className="shop-steps__list">
          {STEPS.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="shop-highlights-title" className="shop-section">
        <AsyncContent {...highlights} onRetry={highlights.reload} loadingText="Cargando regalos...">
          {({ items }) => {
            const featured = items.filter((product) => product.isFeatured)
            const shown = featured.length > 0 ? featured : items
            return (
              <>
                <div className="shop-section__head">
                  <h2 id="shop-highlights-title">
                    {featured.length > 0 ? 'Destacados' : 'Regalos disponibles'}
                  </h2>
                </div>
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
