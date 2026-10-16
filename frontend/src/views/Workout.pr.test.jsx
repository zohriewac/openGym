import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'

// Live PR celebration and the per-row "previous" hint. The store mock is not reactive, so a
// test re-renders by hand after a tick.
const mocks = vi.hoisted(() => {
  const state = { S: null, startRest: vi.fn(), stopRest: vi.fn(), stopWork: vi.fn(), toast: vi.fn() }
  state.storeSnapshot = () => ({
    S: state.S,
    user: null,
    update: mut => { const next = structuredClone(state.S); mut(next); state.S = next },
  })
  state.uiSnapshot = () => ({
    timer: null, work: null, startRest: state.startRest, stopRest: state.stopRest,
    stopWork: state.stopWork, shiftRestOwner: vi.fn(), startWork: vi.fn(), toast: state.toast,
  })
  return state
})

vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector(mocks.storeSnapshot())
  useStore.getState = mocks.storeSnapshot
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const useUI = selector => selector ? selector(mocks.uiSnapshot()) : mocks.uiSnapshot()
  useUI.getState = mocks.uiSnapshot
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({
  startFlow: vi.fn(), exercisePicker: vi.fn(), exConfigSheet: vi.fn(), exerciseDetailSheet: vi.fn(),
  finishWorkout: vi.fn(), finishWorkoutSheet: vi.fn(), workoutCompleteSheet: vi.fn(), confirmSheet: vi.fn(),
  swapActiveWorkoutExercise: vi.fn(), barWeightSheet: vi.fn(), exerciseNoteSheet: vi.fn(),
  sessionNoteSheet: vi.fn(), renameWorkoutSheet: vi.fn(),
}))
vi.mock('../components/Media.jsx', () => ({ default: () => null }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})), IS_APPLE: false, IS_ANDROID: false, BIO: 'biometrics' }))

let dom, root, container
let seq = 0

const past = { d: '2026-01-01', start: 1, entries: [{ id: 'bench-press', target: { mode: 'reps', reps: 5 }, sets: [{ w: 80, r: 5, done: true }, { w: 80, r: 4, done: true }] }] }

function state(sets) {
  return {
    unit: 'kg', restSec: 90, sound: false, effort: 'none', gifSize: 'full', exWeights: {}, routines: [],
    workouts: [past],
    // A fresh start per test: the fired-exercise memory is keyed by session start.
    active: { id: 'active', name: 'T', start: 1000 + ++seq, cur: 0, entries: [{ id: 'bench-press', target: { mode: 'reps', reps: 5, weight: 60, bodyweight: false }, sets }] },
  }
}

async function mount(sets) {
  mocks.S = state(sets)
  const parsed = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>')
  dom = parsed.window
  globalThis.window = dom
  globalThis.document = dom.document
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.navigator })
  for (const key of ['HTMLElement', 'Node', 'Element', 'Event', 'Blob']) globalThis[key] = dom[key]
  dom.Element.prototype.scrollIntoView = vi.fn()
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.getElementById('root')
  root = createRoot(container)
  await act(async () => { root.render(React.createElement(Workout)) })
}

const checks = () => [...container.querySelectorAll('[role="checkbox"]')]
async function tick(i) {
  await act(async () => { checks()[i].dispatchEvent(new dom.Event('click', { bubbles: true })) })
  await act(async () => { root.render(React.createElement(Workout)) })
}
const prToasts = () => mocks.toast.mock.calls.filter(c => String(c[0]).startsWith('New PR'))

beforeEach(() => { vi.clearAllMocks() })
afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  root = container = dom = null
})

describe('live PR', () => {
  it('fires once for the first record set, not again for a second in the same exercise', async () => {
    await mount([{ w: 90, r: 5, done: false }, { w: 95, r: 5, done: false }])
    await tick(0)
    expect(prToasts()).toHaveLength(1)
    expect(prToasts()[0][0]).toMatch(/^New PR: .+ 10\d kg$/)
    expect(checks()[0].className).toContain('pr-burst')
    await tick(1)
    expect(prToasts()).toHaveLength(1)
  })

  it('stays quiet for a set that does not beat the earlier best', async () => {
    await mount([{ w: 60, r: 5, done: false }])
    await tick(0)
    expect(prToasts()).toHaveLength(0)
    expect(checks()[0].className).not.toContain('pr-burst')
  })
})

describe('previous-set hint', () => {
  it('shows last time\'s set in its own column on undone and done rows alike', async () => {
    await mount([{ w: 60, r: 5, done: false }, { w: 60, r: 5, done: true }])
    const rows = [...container.querySelectorAll('.setrow')]
    expect(rows[0].querySelector('.set-prev')?.textContent).toContain('80')
    expect(rows[1].querySelector('.set-prev')?.textContent).toContain('80')
    expect(container.querySelector('.sethead .prev-sp')).toBeTruthy()
  })
})

describe('check pop', () => {
  it('plays only at the tap: a done set mounts without just-done, a ticked one has it, then loses it', async () => {
    await mount([{ w: 60, r: 5, done: true }, { w: 60, r: 5, done: false }])
    expect(checks()[0].className).not.toContain('just-done')
    await tick(1)
    expect(checks()[1].className).toContain('just-done')
    expect(checks()[0].className).not.toContain('just-done')
    await act(async () => { await new Promise(r => setTimeout(r, 350)) })
    expect(checks()[1].className).not.toContain('just-done')
  })
})
