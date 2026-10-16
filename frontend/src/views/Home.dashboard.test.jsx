// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { todayISO, isoOf } from '../lib/format.js'
import Home from './Home.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))
vi.mock('../components/BodyMap.jsx', () => ({ default: () => null, BodyMapLegend: () => null }))

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return isoOf(d) }
const bench = (n, w) => {
  const d = daysAgo(n)
  return { id: 'w' + n, d, start: new Date(d + 'T10:00').getTime(), end: new Date(d + 'T11:00').getTime(), name: 'Push',
    entries: [{ id: '0025', sets: [{ w, r: 5, done: true }, { w, r: 5, done: true }] }] }
}
const mount = patch => {
  useStore.setState(s => ({
    S: { ...s.S, routines: [{ id: 'r', name: 'Push', ex: [{ id: '0025' }] }], workouts: [], bodyweight: [], restingHr: [], dayPlan: {}, week: {}, active: null, showWeightCard: true, ...patch },
    user: null,
  }))
  act(() => root.render(<Home />))
}
const h2s = () => [...host.querySelectorAll('h2')].map(h => h.textContent)

describe('Home dashboard', () => {
  it('new user: no dashboard cards, welcome stays', () => {
    mount({ workouts: [], routines: [], bodyweight: [] })
    expect(host.querySelector('.dash-grid')).toBeNull()
    expect(host.textContent).toContain('Welcome!')
    expect(host.innerHTML).not.toContain('NaN')
  })
  it('with history: ring, volume, consistency, strength, recovery render', () => {
    mount({ workouts: [bench(30, 80), bench(14, 85), bench(0, 90)], bodyweight: [{ d: daysAgo(1), w: 80, t: 1 }, { d: daysAgo(0), w: 81, t: 2 }] })
    expect(host.querySelector('.dash-grid svg.ring')).toBeTruthy()
    expect(host.querySelectorAll('.weekgrid rect')).toHaveLength(84)
    expect(h2s()).toEqual(expect.arrayContaining(['Strength', 'Recovery', 'Body weight']))
    expect(host.innerHTML).not.toContain('NaN')
  })
  it('recovery states are written out, not color only', () => {
    mount({ workouts: [bench(0, 120)] })
    expect(host.textContent).toMatch(/Fatigued|Recovering/)
  })
  it('resting HR row only with data', () => {
    mount({ bodyweight: [{ d: '2026-10-14', w: 80, t: 1 }], restingHr: [] })
    expect(host.textContent).not.toContain('bpm')
    act(() => root.unmount()); root = createRoot(host)
    mount({ bodyweight: [{ d: '2026-10-14', w: 80, t: 1 }], restingHr: [{ d: todayISO(), bpm: 58, t: Date.now() }] })
    expect(host.textContent).toContain('58')
  })
})
