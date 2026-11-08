import { useCallback, useMemo } from 'react'
import { Link, useLocation } from 'react-router'
import { paths, shopProductPath } from '../../../app/paths'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { useFetch } from '../../../hooks/useFetch'
import { ProductImage } from '../components/ProductImage'
import { formatCents } from '../money'
import { ProductNotFoundError, shopService } from '../shopService'
import type { ShopProduct } from '../types'
import { useCart } from './cartContext'
import { buildCartView, describeProblem, type CartEstimate, type CartLine } from './cartView'
import './cart-presentation.css'

/** Viene del checkout o del pago cuando el servidor rechazó por stock (`STOCK_UNAVAILABLE`). */
export interface CartLocationState {
  stockChanged?: boolean
}

/** Datos vigentes de cada regalo del carrito; uno inexistente o despublicado queda en `null`. */
async function loadProducts(ids: string[]): Promise<Map<string, ShopProduct | null>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        return [id, await shopService.product(id)] as const
      } catch (error) {
        if (error instanceof ProductNotFoundError) return [id, null] as const
        throw error
      }
    }),
  )
  return new Map(entries)
}

function QuantityControl({ line }: { line: CartLine }) {
  const { setQuantity } = useCart()
  const name = line.product?.name ?? 'este regalo'
  if (line.maximum === 0) return null

  return (
    <div className="quantity" role="group" aria-label={`Cantidad de ${name}`}>
      <button
        type="button"
        className="btn btn--secondary"
        aria-label={`Disminuir cantidad de ${name}`}
        disabled={line.quantity <= 1}
        onClick={() => setQuantity(line.productId, Math.min(line.quantity - 1, line.maximum))}
      >
        −
      </button>
      <select
        id={`qty-${line.productId}`}
        className="field__input quantity__select"
        value={line.quantity}
        onChange={(event) => setQuantity(line.productId, Number(event.target.value))}
      >
        {Array.from({ length: Math.max(line.maximum, line.quantity) }, (_, index) => index + 1).map(
          (value) => (
            <option key={value} value={value} disabled={value > line.maximum}>
              {value}
            </option>
          ),
        )}
      </select>
      <button
        type="button"
        className="btn btn--secondary"
        aria-label={`Agregar una unidad de ${name}`}
        disabled={line.quantity >= line.maximum}
        onClick={() => setQuantity(line.productId, line.quantity + 1)}
      >
        +
      </button>
    </div>
  )
}

function CartLineItem({ line }: { line: CartLine }) {
  const { removeItem } = useCart()
  const { product } = line
  const name = product?.name ?? 'Regalo no disponible'

  return (
    <li className={`cart-line${line.problem ? ' cart-line--problem' : ''}`} aria-label={name}>
      {product ? (
        <Link
          to={shopProductPath(product.id)}
          className="cart-line__picture"
          aria-label={`Ver ${name}`}
        >
          <ProductImage src={product.primaryImageUrl} alt={name} className="cart-line__image" />
        </Link>
      ) : (
        <ProductImage src={null} alt={name} className="cart-line__image" />
      )}
      <div className="cart-line__info">
        {product ? (
          <Link to={shopProductPath(product.id)} className="cart-line__name">
            {product.name}
          </Link>
        ) : (
          <span className="cart-line__name">{name}</span>
        )}
        {product && <p className="text-muted">{formatCents(product.priceCents)} / unidad</p>}
        {line.problem && (
          <p className="cart-line__problem" role="alert">
            {describeProblem(line.problem)}
          </p>
        )}
        {line.maximum > 0 && (
          <label className="quantity-label" htmlFor={`qty-${line.productId}`}>
            Cantidad · {name}
          </label>
        )}
        <QuantityControl line={line} />
      </div>
      <div className="cart-line__end">
        <strong className="cart-line__total">
          {line.problem ? '—' : formatCents(line.lineTotalCents)}
        </strong>
        <Button variant="secondary" onClick={() => removeItem(line.productId)}>
          Quitar <span className="visually-hidden">{name}</span>
        </Button>
      </div>
    </li>
  )
}

function CartHeading() {
  return (
    <header className="cart__heading">
      <nav aria-label="Ruta de navegación" className="cart__breadcrumb">
        <Link to={paths.shop}>Inicio</Link>
        <span aria-hidden="true">/</span>
        <Link to={paths.shopCatalog}>Catálogo</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Bolsa</span>
      </nav>
      <h1>Tu bolsa de regalos</h1>
      <p>Revisa tus detalles, antes del siguiente paso.</p>
    </header>
  )
}

function CartSummary({ estimate, canCheckout }: { estimate: CartEstimate; canCheckout: boolean }) {
  return (
    <aside className="cart-summary" aria-labelledby="cart-summary-title">
      <p className="cart__eyebrow">Un vistazo a tus regalos</p>
      <h2 id="cart-summary-title">Resumen estimado</h2>
      <dl>
        <div>
          <dt>Productos</dt>
          <dd>{estimate.units}</dd>
        </div>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatCents(estimate.subtotalCents)}</dd>
        </div>
        <div>
          <dt>Envío incluido</dt>
          <dd>{formatCents(estimate.shippingCents)}</dd>
        </div>
        <div>
          <dt>{estimate.taxEnabled ? `IVA ${estimate.taxPercent} %` : 'IVA'}</dt>
          <dd>{formatCents(estimate.taxCents)}</dd>
        </div>
        <div className="cart-summary__total">
          <dt>Total estimado</dt>
          <dd>{formatCents(estimate.totalCents)}</dd>
        </div>
      </dl>
      <p className="text-muted">El total se confirma antes de pagar.</p>
      {canCheckout ? (
        <Link to={paths.shopCheckout} className="btn btn--primary cart-summary__cta">
          Continuar a la entrega <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <Button disabled className="cart-summary__cta">
          Continuar a la entrega
        </Button>
      )}
    </aside>
  )
}

const EMPTY_ESTIMATE: CartEstimate = {
  units: 0,
  subtotalCents: 0,
  taxEnabled: false,
  taxPercent: 0,
  taxCents: 0,
  shippingCents: 0,
  totalCents: 0,
}

/** Carrito: revalida precio, stock y límite con la API cada vez que se abre. */
export function CartPage() {
  const { items } = useCart()
  const stockChanged = (useLocation().state as CartLocationState | null)?.stockChanged
  const idsKey = items.map((item) => item.productId).join(',')
  const loadCartProducts = useCallback(
    () => loadProducts(idsKey ? idsKey.split(',') : []),
    [idsKey],
  )
  const products = useFetch(loadCartProducts, 'No se pudieron revisar los regalos del carrito')
  const settings = useFetch(
    shopService.settings,
    'No se pudo consultar la configuración de la tienda',
  )

  const view = useMemo(
    () =>
      products.data && settings.data
        ? buildCartView(items, products.data, settings.data)
        : undefined,
    [items, products.data, settings.data],
  )

  if (items.length === 0) {
    return (
      <div className="shop-page cart cart-presentation">
        <CartHeading />
        <div className="cart__layout">
          <section className="card cart-empty">
            <h2>Tu bolsa espera un detalle.</h2>
            <Link to={paths.shopCatalog} className="btn btn--primary">
              Explorar el catálogo
            </Link>
          </section>
          <CartSummary
            estimate={{
              ...EMPTY_ESTIMATE,
              taxEnabled: settings.data?.tax.enabled ?? false,
              taxPercent: settings.data?.tax.ratePercent ?? 0,
            }}
            canCheckout={false}
          />
        </div>
      </div>
    )
  }

  const error = products.error ?? settings.error

  return (
    <div className="shop-page cart cart-presentation">
      <CartHeading />
      {stockChanged && (
        <Alert>
          Algunos regalos ya no tienen stock suficiente. Revisa las líneas marcadas antes de
          continuar; no se hizo ningún cobro.
        </Alert>
      )}
      {error && (
        <Alert>
          <span>{error}.</span>{' '}
          <Button
            variant="secondary"
            onClick={() => {
              products.reload()
              settings.reload()
            }}
          >
            Reintentar
          </Button>
        </Alert>
      )}
      {!view && !error && (
        <p role="status" className="empty-state">
          Revisando precios y disponibilidad...
        </p>
      )}
      {view && (
        <div className="cart__layout">
          <section aria-labelledby="cart-lines-title">
            <h2 id="cart-lines-title" className="visually-hidden">
              Regalos en el carrito
            </h2>
            {view.hasProblems && (
              <p className="cart__blocked" role="note">
                Corrige o elimina las líneas marcadas para continuar al checkout.
              </p>
            )}
            <ul className="cart-lines">
              {view.lines.map((line) => (
                <CartLineItem key={line.productId} line={line} />
              ))}
            </ul>
            <Link to={paths.shopCatalog} className="cart__back">
              ← Seguir eligiendo regalos
            </Link>
          </section>
          <CartSummary estimate={view.estimate} canCheckout={view.canCheckout && !error} />
        </div>
      )}
    </div>
  )
}
