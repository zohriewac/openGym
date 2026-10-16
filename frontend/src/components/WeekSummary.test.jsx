// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let S
vi.mock('../store/useStore.js', () => ({ useStore: sel => sel({ S }) }))
const { default: WeekSummary } = await import('./WeekSummary.jsx')

const wo = (d, w) => ({ id: d, d, start: Date.parse(d + 'T10:00'), end: Date.parse(d + 'T11:00'), entries: [{ id: 'bench', sets: [{ w, r: 5, done: true }] }] })
const iso = off => { const d = new Date(); d.setDate(d.getDate() + off); return d.toLocaleDateString('sv') }
let container, root
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(() => { act(() => root.unmount()); container.remove() })
const base = { workouts: [], bodyweight: [], unit: 'kg', weekStart: 1, routines: [], week: {} }

describe('WeekSummary', () => {
  it('renders nothing for a brand-new user', () => {
    S = base
    act(() => root.render(<WeekSummary />))
    expect(container.innerHTML).toBe('')
  })
  it('shows the numbers for a seeded state', () => {
    S = { ...base, workouts: [wo(iso(0), 100)] }
    act(() => root.render(<WeekSummary />))
    const vals = [...container.querySelectorAll('.ws-v')].map(n => n.textContent)
    expect(vals[0]).toBe('1')
    expect(vals[1]).toContain('500 kg')
    expect(container.textContent).toContain('This week')
  })
})
