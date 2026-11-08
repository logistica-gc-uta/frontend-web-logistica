/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ShopLayout } from './components/ShopLayout'

// Vitest omite CSS; leer el archivo permite comprobar el aislamiento sin afirmar prueba visual.
const css = readFileSync('src/styles/shop.css', 'utf8')
const orderCss = readFileSync('src/features/shop/orders/orders-presentation.css', 'utf8')

describe('Shop · tema aislado', () => {
  it('ocasiones: estructura una sola fila dinámica con desplazamiento interno, no de página', () => {
    const row = css.match(/\.shop \.shop-home \.occasion-grid\s*\{([^}]+)\}/)?.[1] ?? ''
    expect(row).toContain('grid-auto-flow: column;')
    expect(row).toContain('grid-auto-columns: minmax(160px, 1fr);')
    expect(row).toContain('grid-template-rows: 1fr;')
    expect(row).toContain('overflow-x: auto;')
    expect(row).toContain('max-width: 100%;')
    expect(row).toContain('min-width: 0;')
    expect(row).toContain('padding: 10px;') // foco (3px + 4px) y elevación hover (2px)
    expect(css).not.toMatch(/(?:occasion-grid|category-grid)\s*\{[^}]*grid-template-columns:/s)
    expect(css).toMatch(/\.shop \.shop-home \.occasion-name\s*\{[^}]*overflow-wrap: anywhere;/s)
  })

  it('encuadre: reserva marcos contain específicos sin cambiar miniaturas ni hero', () => {
    expect(css).toMatch(/\.shop \.product-figure\s*\{[^}]*position: relative;[^}]*aspect-ratio: 4 \/ 3;/s)
    expect(css).toMatch(/\.shop \.product-figure > \.product-image\s*\{[^}]*position: absolute;[^}]*height: calc\(100% - 20px\);[^}]*max-height: none;[^}]*object-fit: contain;/s)
    expect(css).toMatch(/\.shop \.product-detail-page \.stage\s*\{[^}]*position: relative;[^}]*aspect-ratio: 6 \/ 5;/s)
    expect(css).toMatch(/\.shop \.product-detail-page \.stage > \.product-image\s*\{[^}]*position: absolute;[^}]*height: calc\(100% - 32px\);[^}]*max-height: none;[^}]*object-fit: contain;/s)
    expect(css).toMatch(/\.shop \.product-image\s*\{[^}]*max-height: 170px;[^}]*object-fit: cover;/s)
    expect(css).toMatch(/\.shop \.gallery__thumb \.product-image\s*\{[^}]*max-height: 56px;/s)
    expect(css).toMatch(/\.shop \.hero-collage__item img\s*\{[^}]*object-fit: cover;/s)
  })

  it('contenedores: separa home editorial y detalle del catálogo ancho', () => {
    expect(css).toMatch(/\.shop \.shop-home\s*\{[^}]*width: 100%;[^}]*max-width: 1440px;[^}]*margin-inline: auto;/s)
    expect(css).toMatch(/\.shop \.product-detail-page\s*\{[^}]*width: 100%;[^}]*max-width: 1280px;[^}]*margin-inline: auto;/s)
    expect(css).toMatch(/@media \(min-width: 2400px\)\s*\{[^}]*\.shop \.shop-main\s*\{[^}]*width: min\(2240px, calc\(100% - 120px\)\);/s)
  })

  it('reserva una fila móvil para el buscador y el selector de tema', () => {
    const mobile = css.slice(css.indexOf('@media (max-width: 640px)'))
    expect(mobile).toMatch(/\.shop-header__top\s*\{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) 44px;/s)
    expect(mobile).toMatch(/\.shop-search\s*\{[^}]*grid-column: 1;[^}]*grid-row: 2;/s)
    expect(mobile).toMatch(/\.shop-theme-toggle\s*\{[^}]*grid-column: 2;[^}]*grid-row: 2;/s)
  })

  it('contiene los campos del filtro dentro de su columna', () => {
    expect(css).toMatch(/\.catalog-filters\s*\{[^}]*align-items: stretch;/s)
    expect(css).toMatch(/\.catalog-filters__prices\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s)
    expect(css).toMatch(/\.catalog-filters \.field[^}]*min-width: 0;/s)
  })

  it('no exporta clases genéricas del diseño al panel administrativo', () => {
    const bare = css.split('\n').map((line) => line.trim()).filter((line) =>
      /^\.(?:filters|intro|breadcrumb|price-fields|filter-group|check|stage|thumb|quantity)\b/.test(line),
    )
    expect(bare).toEqual([])
  })

  it('define tinta y superficies de impresión independientes del tema oscuro', () => {
    const print = orderCss.slice(orderCss.indexOf('@media print'))
    expect(print).toMatch(/\.shop \.order-receipt-page\s*\{[^}]*--color-heading: #234D3E !important;[^}]*--color-muted: #4F6257 !important;[^}]*--color-surface: #ffffff !important;/s)
  })

  it('inicia claro y alterna solo la raíz de la tienda entre búsqueda y cuenta', () => {
    const rootTheme = document.documentElement.getAttribute('data-theme')
    const { container } = render(
      <MemoryRouter>
        <Routes><Route element={<ShopLayout />}><Route path="/" element={<p>Tienda</p>} /></Route></Routes>
      </MemoryRouter>,
    )
    const shop = container.querySelector('.shop')!
    expect(shop).toHaveAttribute('data-theme', 'light')
    const toggle = screen.getByRole('button', { name: 'Modo oscuro' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('search').compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(toggle.compareDocumentPosition(screen.getByRole('navigation', { name: 'Cuenta' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(toggle)
    expect(shop).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByRole('button', { name: 'Modo oscuro' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.getAttribute('data-theme')).toBe(rootTheme)
    fireEvent.click(toggle)
    expect(shop).toHaveAttribute('data-theme', 'light')
  })

  it('define paletas y esquema locales sin reglas de tema global ni dependencia del SO', () => {
    expect(css).toMatch(/\.shop\s*\{[^}]*color-scheme:\s*light;/s)
    expect(css).toMatch(/\.shop\[data-theme='dark'\]\s*\{[^}]*color-scheme:\s*dark;/s)
    expect(css).toContain('--color-bg: #F8F6F1')
    expect(css).toContain('--color-accent: #234D3E')
    expect(css).not.toMatch(/:root|prefers-color-scheme/)
    expect(css).toMatch(/@media \(hover: hover\)[\s\S]*?\.shop \.hero-collage__item:hover\s*\{[^}]*z-index: 6;[^}]*transform:/)
    expect(css).toContain(".shop .hero-collage__item:is(:focus, [aria-pressed='true'])")
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
