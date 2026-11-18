/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ShopLayout } from './components/ShopLayout'

// Vitest omite CSS; leer el archivo permite comprobar el aislamiento sin afirmar prueba visual.
const css = readFileSync('src/styles/shop.css', 'utf8')
const orderCss = readFileSync('src/features/shop/orders/orders-presentation.css', 'utf8')

describe('Shop · tema aislado', () => {
  it('ocasiones: dos filas que se deslizan en sentidos opuestos con el scroll, sin desbordar la página', () => {
    const marquee = css.match(/\.shop \.shop-home \.occasion-marquee\s*\{([^}]+)\}/)?.[1] ?? ''
    expect(marquee).toContain('grid-template-columns: minmax(0, 1fr);')
    expect(marquee).toContain('overflow-x: clip;')
    expect(marquee).toContain('mask-image: linear-gradient(')
    expect(css).toMatch(/\.occasion-row--a\s*\{[^}]*translateX\(calc\(-50% \+ var\(--occasion-shift\) \* 1px\)\)/s)
    expect(css).toMatch(/\.occasion-row--b\s*\{[^}]*translateX\(calc\(-50% - var\(--occasion-shift\) \* 1px\)\)/s)
    expect(css).toMatch(/\.shop \.shop-home \.occasion\s*\{[^}]*white-space: nowrap;/s)
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

  it('filtros del catálogo: una sola fila bajo el título y productos a todo el ancho', () => {
    expect(css).toMatch(/\.catalog-filters\s*\{[^}]*flex-direction: row;[^}]*flex-wrap: wrap;[^}]*align-items: flex-end;/s)
    expect(css).toMatch(/\.catalog__layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/s)
    expect(css).toMatch(/\.catalog-filters__prices\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(130px, 1fr\)\);/s)
    expect(css).toMatch(/\.catalog-filters \.field[^}]*min-width: 0;/s)
    const mobile = css.slice(css.indexOf('@media (max-width: 768px)'))
    expect(mobile).toMatch(/\.shop \.catalog-filters\s*\{[^}]*flex-direction: column;/s)
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

  it('cabecera sin buscador ni selector de tema: el buscador vive en el recuadro verde', () => {
    const { container } = render(
      <MemoryRouter>
        <Routes><Route element={<ShopLayout />}><Route path="/" element={<p>Tienda</p>} /></Route></Routes>
      </MemoryRouter>,
    )
    expect(container.querySelector('.shop')).toHaveAttribute('data-theme', 'light')
    expect(screen.queryByRole('button', { name: 'Modo oscuro' })).not.toBeInTheDocument()
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Cuenta' })).toBeInTheDocument()
  })

  it('define la paleta clara local sin reglas de tema global ni dependencia del SO', () => {
    expect(css).toMatch(/\.shop\s*\{[^}]*color-scheme:\s*light;/s)
    expect(css).not.toContain("data-theme='dark'")
    expect(css).toContain('--color-bg: #F8F6F1')
    expect(css).toContain('--color-accent: #234D3E')
    expect(css).not.toMatch(/:root|prefers-color-scheme/)
    expect(css).toMatch(/@media \(hover: hover\)[\s\S]*?\.shop \.hero-collage__item:hover\s*\{[^}]*z-index: 6;[^}]*transform:/)
    expect(css).toContain(".shop .hero-collage__item:is(:focus, [aria-pressed='true'])")
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
