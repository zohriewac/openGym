// @vitest-environment happy-dom
// The session progress bar under the workout header: a full-width track whose fill is scaled
// (transform only) to sets done / total.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { editCompletedSession } from '../lib/session-edit.js'

vi.mock('../lib/sound.js', () => ({ beep: vi.fn(), chime: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn(), unlock: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})), appBase: () => '/' }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const done = (id, w) => ({ id, target: { sets: 1, reps: 5, weight: w }, sets: [{ w, r: 5, done: true }] })
const saved = { id: 'saved', d: '2026-09-22', start: 1000, end: 2000, routineIds: [], name: 'Push', entries: [done('0025', 80), done('0027', 60)], prs: [] }

let root
let container

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  const S = JSON.parse(JSON.stringify(DEF))
  S.workouts = [JSON.parse(JSON.stringify(saved))]
  S.workoutView = 'list'
  editCompletedSession(S, 'saved')
  useStore.setState({ S, user: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<MemoryRouter><Workout /></MemoryRouter>))
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers() })

const fill = () => container.querySelector('.wprog > i')

describe('workout progress bar', () => {
  it('scales the fill to sets done / total', () => {
    expect(fill().style.transform).toBe('scaleX(1)')
    act(() => useStore.getState().update(s => { s.active.entries[0].sets[0].done = false }))
    expect(fill().style.transform).toBe('scaleX(0.5)')
    expect(fill().style.width).toBe('')
    expect(container.querySelector('.wprog').getAttribute('aria-valuenow')).toBe('1')
  })
})
