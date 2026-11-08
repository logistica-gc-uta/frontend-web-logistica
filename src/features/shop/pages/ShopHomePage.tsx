import { useState } from 'react'
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

/** Hasta tres fotos reales: el foco/hover las eleva; tocar solo selecciona en sitio. */
function HeroCollage({ products }: { products: readonly ShopProduct[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [failed, setFailed] = useState<string[]>([])
  const withPhoto = products
    .filter((product) => product.primaryImageUrl && !failed.includes(product.id))
    .slice(0, 3)
  if (withPhoto.length === 0) return null

  return (
    <figure className="hero-art shop-hero__art" aria-label="Regalos destacados" aria-describedby="hero-hint">
      <div className={`hero-collage hero-collage--${withPhoto.length}`} role="group" aria-label="Regalos de la tienda">
        {withPhoto.map((product) => (
          <button
            key={product.id}
            type="button"
            className="hero-card hero-collage__item"
            aria-label={`Destacar ${product.name}`}
            aria-pressed={selected === product.id}
            onClick={() => setSelected((current) => (current === product.id ? null : product.id))}
          >
            <img
              src={product.primaryImageUrl ?? ''}
              alt={product.name}
              loading="eager"
              decoding="async"
              onError={() => setFailed((current) => [...current, product.id])}
            />
            <span className="hero-card-name hero-collage__name">{product.name}</span>
            <span className="hero-card-price hero-collage__price">{formatCents(product.priceCents)}</span>
          </button>
        ))}
      </div>
      <figcaption id="hero-hint" className="visually-hidden">
        Pasa el puntero o enfoca con Tab para ver cada tarjeta al frente; toca para mantenerla seleccionada aquí.
      </figcaption>
    </figure>
  )
}

export function ShopHomePage() {
  const categories = useFetch(shopService.categories, 'No se pudieron cargar las categorías')
  const highlights = useFetch(loadHighlights, 'No se pudieron cargar los regalos')

  return (
    <div className="shop-page shop-home">
      <section className="hero shop-hero" aria-labelledby="shop-hero-title">
        <div className="hero-copy shop-hero__copy">
          <p className="eyebrow shop-eyebrow">Detalles con intención</p>
          <h1 id="shop-hero-title">
            Hay regalos que <br />lo dicen todo.
          </h1>
          <p>Para celebrar, agradecer o simplemente decir: pensé en ti.</p>
          <div className="shop-hero__actions">
            <Link to={paths.shopCatalog} className="cta btn btn--primary" aria-label="Ver regalos">
              Encuentra tu detalle <span aria-hidden="true">↗</span>
            </Link>
            <a href="#shop-categories-title" className="shop-hero__secondary">
              Buscar por ocasión
            </a>
          </div>
        </div>
        {highlights.data && <HeroCollage products={highlights.data.items} />}
      </section>

      <section aria-labelledby="shop-categories-title" className="shop-section">
        <div className="section-heading shop-section__head">
          <div>
            <h2 id="shop-categories-title">Cada ocasión, un detalle.</h2>
            <p>Empieza por lo que quieres decir.</p>
          </div>
          <Link to={paths.shopCatalog}>Ver todo el catálogo</Link>
        </div>
        <AsyncContent
          {...categories}
          onRetry={categories.reload}
          loadingText="Cargando categorías..."
        >
          {(items) => {
            const withProducts = items
              .filter((category) => category.productCount > 0)
              .sort((a, b) => b.productCount - a.productCount)
              .slice(0, HOME_CATEGORIES)
            return withProducts.length === 0 ? (
              <p className="empty-state">Todavía no hay categorías con regalos publicados.</p>
            ) : (
              <div className="occasion-grid category-grid">
                {withProducts.map((category, index) => (
                  <CategoryCard key={category.id} category={category} index={index} />
                ))}
              </div>
            )
          }}
        </AsyncContent>
      </section>

      <section aria-labelledby="shop-highlights-title" className="shop-section catalog">
        <AsyncContent {...highlights} onRetry={highlights.reload} loadingText="Cargando regalos...">
          {({ items }) => {
            const featured = items.filter((product) => product.isFeatured)
            const shown = featured.length > 0 ? featured : items
            return (
              <>
                <div className="section-heading shop-section__head">
                  <div>
                    <h2 id="shop-highlights-title">
                      {featured.length > 0 ? 'Destacados' : 'Regalos disponibles'}
                    </h2>
                    <p>Detalles listos para enviar.</p>
                  </div>
                </div>
                {shown.length === 0 ? (
                  <p className="empty-state">Todavía no hay regalos publicados.</p>
                ) : (
                  <ul className="products product-grid">
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
