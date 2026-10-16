// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import WeekGrid from './WeekGrid.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('WeekGrid', () => {
  it('renders one rect per day, on/off by n, with the label', () => {
    const days = Array.from({ length: 84 }, (_, i) => ({ iso: `d${i}`, n: i === 3 ? 2 : 0 }))
    const host = document.createElement('div')
    act(() => createRoot(host).render(<WeekGrid days={days} label="Trained 1 of 12" />))
    expect(host.querySelectorAll('rect')).toHaveLength(84)
    expect(host.querySelectorAll('rect.on')).toHaveLength(1)
    expect(host.querySelectorAll('rect.off')).toHaveLength(83)
    expect(host.querySelector('svg').getAttribute('aria-label')).toBe('Trained 1 of 12')
  })
})
