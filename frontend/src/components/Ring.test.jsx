// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import Ring from './Ring.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const render = props => {
  const host = document.createElement('div')
  act(() => createRoot(host).render(<Ring {...props} />))
  return host
}

describe('Ring', () => {
  it('draws the arc to value/max', () => {
    const arcs = render({ value: 2, max: 4, size: 64, stroke: 7, label: 'x' }).querySelectorAll('circle')
    const C = 2 * Math.PI * 28.5
    expect(arcs).toHaveLength(2)
    expect(Number(arcs[1].getAttribute('stroke-dashoffset'))).toBeCloseTo(C * 0.5, 3)
  })
  it('max 0 leaves the arc out, no NaN', () => {
    const h = render({ value: 0, max: 0, label: 'x' })
    expect(h.querySelectorAll('circle')).toHaveLength(1)
    expect(h.innerHTML).not.toContain('NaN')
  })
  it('clamps value above max to full', () => {
    const arcs = render({ value: 9, max: 4, label: 'x' }).querySelectorAll('circle')
    expect(Number(arcs[1].getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 5)
  })
  it('exposes the label', () => { expect(render({ value: 1, max: 2, label: 'Hello' }).querySelector('svg').getAttribute('aria-label')).toBe('Hello') })
})
