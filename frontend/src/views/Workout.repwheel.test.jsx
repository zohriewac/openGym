import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'
import { tick } from '../lib/sound.js'

// Tapping the reps value opens a strip of numbers; tapping one writes it through the same
// setter as the stepper and gives the commit tick. Scroll-snap itself needs a real browser.
const mocks = vi.hoisted(() => {
  const state = { S: null, fn: vi.fn() }
  state.storeSnapshot = () => ({
    S: state.S, user: null,
    update: mut => { const next = structuredClone(state.S); mut(next); state.S = next },
  })
  state.uiSnapshot = () => ({ sheets: [], timer: null, work: null, startRest: state.fn, stopRest: state.fn, stopWork: state.fn,
    shiftRestOwner: state.fn, startWork: state.fn, toast: state.fn })
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
vi.mock('../sheets.jsx', () => Object.fromEntries(['startFlow', 'exercisePicker', 'exConfigSheet', 'exerciseDetailSheet', 'finishWorkout', 'finishWorkoutSheet',
  'workoutCompleteSheet', 'confirmSheet', 'swapActiveWorkoutExercise', 'barWeightSheet', 'exerciseNoteSheet', 'sessionNoteSheet', 'renameWorkoutSheet',
  'exitWorkoutEdit', 'menuSheet', 'effortPickerSheet', 'exerciseHistorySheet', 'addRoutineToSessionSheet'].map(k => [k, vi.fn()])))
vi.mock('../components/Media.jsx', () => ({ default: () => null }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})), IS_APPLE: false, IS_ANDROID: false, BIO: 'biometrics' }))
vi.mock('../lib/sound.js', async orig => ({ ...(await orig()), tick: vi.fn() }))

let dom, root, container

async function mount() {
  mocks.S = {
    unit: 'kg', restSec: 90, sound: false, effort: 'none', gifSize: 'full', workouts: [], exWeights: {}, routines: [],
    active: { id: 'active', name: 'T', start: Date.now(), cur: 0, entries: [
      { id: 'press', target: { mode: 'reps', reps: 8, weight: 60, bodyweight: false }, sets: [{ w: 60, r: 5, done: false }] }] },
  }
  const parsed = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>')
  dom = parsed.window
  globalThis.window = dom
  globalThis.document = dom.document
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.navigator })
  for (const key of ['HTMLElement', 'Node', 'Element', 'Event', 'Blob']) globalThis[key] = dom[key]
  dom.Element.prototype.scrollIntoView = vi.fn()
  dom.innerWidth = 400
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.getElementById('root')
  root = createRoot(container)
  await act(async () => { root.render(React.createElement(Workout)) })
}
const click = async el => { await act(async () => { el.dispatchEvent(new dom.Event('click', { bubbles: true })) }) }

beforeEach(() => vi.clearAllMocks())
afterEach(async () => { if (root) await act(async () => { root.unmount() }); root = null })

describe('rep wheel', () => {
  it('opens on the reps value, commits a tapped number and ticks', async () => {
    await mount()
    const cell = container.querySelectorAll('.setrow .stp')[1].querySelector('.repbtn')
    expect(cell.textContent).toBe('5')
    await click(cell)
    expect(document.querySelector('.repwheel')).toBeTruthy()
    await click(document.querySelector('.repwheel button[aria-label="12"]'))
    expect(mocks.S.active.entries[0].sets[0].r).toBe(12)
    expect(tick).toHaveBeenCalledWith('commit')
    expect(document.querySelector('.repwheel')).toBeNull()
  })

  it('closes on Escape without changing the value', async () => {
    await mount()
    await click(container.querySelectorAll('.setrow .stp')[1].querySelector('.repbtn'))
    await act(async () => { const e = new dom.Event('keydown', { bubbles: true }); e.key = 'Escape'; document.dispatchEvent(e) })
    expect(document.querySelector('.repwheel')).toBeNull()
    expect(mocks.S.active.entries[0].sets[0].r).toBe(5)
  })

  it('the keyboard button gives the plain input back', async () => {
    await mount()
    await click(container.querySelectorAll('.setrow .stp')[1].querySelector('.repbtn'))
    await click(document.querySelector('.repwheel-kb'))
    expect(container.querySelectorAll('.setrow .stp')[1].querySelector('input.num')).toBeTruthy()
  })
})
