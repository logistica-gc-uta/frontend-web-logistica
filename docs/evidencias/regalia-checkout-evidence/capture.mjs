// Isolated presentation captures. All API calls are doubled; no login, quote or payment reaches a backend.
// Public catalog photos/settings are read once, then replayed. This is not real checkout integration proof.
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const phase = process.argv[2]
if (!['before', 'after'].includes(phase)) throw Error('Expected before or after')
const dir = dirname(fileURLToPath(import.meta.url))
const api = 'http://127.0.0.1:3000/api/v1'
const get = async (path) => {
  const r = await fetch(api + path)
  if (!r.ok) throw Error(`Public GET ${path}: ${r.status}`)
  return r.json()
}
const [catalog, settings, categories] = await Promise.all([
  get('/shop/products?pageSize=2'), get('/shop/settings'), get('/shop/categories'),
])
const products = catalog.items.slice(0, 2)
if (products.length !== 2 || products.some(p => !p.primaryImageUrl)) throw Error('Two public photos required')
const items = products.map(p => ({ productId: p.id, quantity: 1 }))
const subtotalCents = products.reduce((sum, p) => sum + p.priceCents, 0)
const taxAmount = settings.tax.enabled ? Math.floor((subtotalCents * settings.tax.rateBps + 5000) / 10000) : 0
const quote = {
  items: products.map(p => ({ productId: p.id, name: p.name, quantity: 1,
    unitPriceCents: p.priceCents, lineTotalCents: p.priceCents, available: true, availableStock: p.stock })),
  subtotalCents, shipping: { status: 'FREE_INCLUDED', amountCents: 0 },
  tax: { ...settings.tax, amountCents: taxAmount }, totalCents: subtotalCents + taxAmount,
  settingsVersion: settings.version, validUntil: '2099-01-01T00:00:00Z', quoteToken: 'visual-double-not-valid',
}
await mkdir(dir, { recursive: true })
const browser = await chromium.launch({ headless: true })
const records = [], unexpected = []
try {
  for (const width of (phase === 'before' ? [2551, 390] : [2551, 1440, 768, 390, 320])) {
    const context = await browser.newContext({ viewport: { width, height: width > 500 ? 1440 : 1100 } })
    const page = await context.newPage()
    let zones = []
    await context.route('**/api/v1/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname.replace('/api/v1', '')
      let data
      if (req.method() === 'GET' && path === '/shop/settings') data = settings
      else if (req.method() === 'GET' && path === '/shop/categories') data = categories
      else if (req.method() === 'GET' && path === '/shop/products') data = catalog
      else if (req.method() === 'GET' && path.startsWith('/shop/products/')) data = products.find(p => p.id === decodeURIComponent(path.split('/').at(-1)))
      else if (req.method() === 'GET' && path === '/zones') data = zones
      else if (req.method() === 'POST' && path === '/shop/checkout/quote') data = quote
      else { unexpected.push({ method: req.method(), path }); return route.abort() }
      if (data === undefined) throw Error(`Missing doubled data: ${path}`)
      await route.fulfill({ json: data })
    })
    await page.goto('http://127.0.0.1:5173/shop', { waitUntil: 'domcontentloaded' })
    zones = await page.evaluate(async ({ items, quote }) => {
      const fixtures = await import('/src/test/checkoutFixtures.ts')
      const { zones } = await import('/src/test/fixtures.ts')
      const { cartStorage } = await import('/src/features/shop/cart/cartStorage.ts')
      const { checkoutStorage } = await import('/src/features/shop/checkout/checkoutStorage.ts')
      fixtures.signInCustomer()
      cartStorage.save(items, fixtures.customer.id)
      const zone = zones.find(z => z.depotLocation !== null)
      checkoutStorage.save(fixtures.checkoutDraft({ items, quote,
        acceptedTotalCents: quote.totalCents,
        delivery: { ...fixtures.delivery, zoneId: zone.id },
      }))
      return zones
    }, { items, quote })
    await page.goto('http://127.0.0.1:5173/shop/checkout', { waitUntil: 'domcontentloaded' })
    await page.locator('.checkout__unquoted-image').first().waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('.checkout__unquoted-image')].every(i => i.complete && i.naturalWidth > 0))
    const capture = async screen => {
      await page.screenshot({ path: join(dir, `${phase}-${screen}-${width}.png`), fullPage: true })
      const m = await page.evaluate(() => ({
        viewport: innerWidth, pageWidth: document.documentElement.scrollWidth,
        checkoutWidth: document.querySelector('.checkout-presentation').getBoundingClientRect().width,
        photos: [...document.querySelectorAll('.checkout__aside img')].map(i => ({src: i.src, alt: i.alt, fit: getComputedStyle(i).objectFit, loaded: i.complete && i.naturalWidth > 0})),
        total: document.querySelector('.cart-summary__total')?.textContent.trim(),
      }))
      records.push({ screen, ...m })
      if (phase === 'after' && (m.pageWidth > width + 1 || m.checkoutWidth > 1281 || m.photos.length !== products.length || m.photos.some(i => !i.loaded || i.fit !== 'contain'))) throw Error(JSON.stringify(m))
    }
    await capture('delivery')
    await page.getByRole('button', { name: 'Calcular total', exact: true }).click()
    await page.getByRole('region', { name: 'Total a pagar', exact: true }).waitFor()
    if (phase === 'after') await page.waitForFunction(() => document.querySelectorAll('.quote-summary img').length === 2 && [...document.querySelectorAll('.quote-summary img')].every(i => i.complete && i.naturalWidth > 0))
    await capture('quoted')
    await page.getByRole('button', { name: /^Continuar al pago/ }).click()
    await page.getByRole('form', { name: 'Pago con tarjeta' }).waitFor()
    if (phase === 'after') {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByRole('form', { name: 'Pago con tarjeta' }).waitFor()
    }
    if (phase === 'after') await page.waitForFunction(() => document.querySelectorAll('.quote-summary img').length === 2 && [...document.querySelectorAll('.quote-summary img')].every(i => i.complete && i.naturalWidth > 0))
    await capture('payment')
    await context.close()
  }
  if (unexpected.length) throw Error(JSON.stringify({ unexpected }))
  await writeFile(join(dir, `${phase}-measurements.json`), JSON.stringify({ mode: 'isolated API doubles; public catalog photo data', records, unexpected }, null, 2) + '\n')
  console.log(JSON.stringify({ phase, records, unexpected }))
} finally { await browser.close() }
