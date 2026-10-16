import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pullHealthKit, isHealthKit, healthKitOn } from './healthkit-sync.js'

const S = () => ({ unit: 'kg', bodyweight: [], restingHr: [] })
const store = new Map()
const bridge = fn => vi.stubGlobal('window', { webkit: { messageHandlers: { health: { postMessage: fn } } } })

beforeEach(() => {
  store.clear()
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) })
})

describe('pullHealthKit', () => {
  it('is unsupported without the native handler', async () => {
    expect(isHealthKit()).toBe(false)
    expect(await pullHealthKit(S, vi.fn())).toEqual({ status: 'unsupported', added: 0 })
  })
  it('merges the samples and remembers the connection', async () => {
    bridge(async () => ({ status: 'ok', weights: [{ d: '2026-10-01', kg: 80, t: 1 }], restingHr: [{ d: '2026-10-01', bpm: 55, t: 1 }] }))
    const s = S()
    const update = vi.fn(fn => fn(s))
    expect(await pullHealthKit(() => s, update)).toEqual({ status: 'ok', added: 2 })
    expect(s.bodyweight).toEqual([{ d: '2026-10-01', w: 80, t: 1 }])
    expect(s.restingHr).toEqual([{ d: '2026-10-01', bpm: 55, t: 1 }])
    expect(healthKitOn()).toBe(true)
  })
  it('does not touch state when Health has nothing new', async () => {
    bridge(async () => ({ status: 'ok', weights: [], restingHr: [] }))
    const update = vi.fn()
    expect(await pullHealthKit(S, update)).toEqual({ status: 'ok', added: 0 })
    expect(update).not.toHaveBeenCalled()
  })
  it('reports unavailable and failed without throwing', async () => {
    bridge(async () => ({ status: 'unavailable' }))
    expect((await pullHealthKit(S, vi.fn())).status).toBe('unavailable')
    bridge(async () => { throw new Error('locked') })
    expect((await pullHealthKit(S, vi.fn())).status).toBe('failed')
  })
})
