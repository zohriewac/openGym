import { describe, it, expect } from 'vitest'
import { mergeHealth } from './healthkit.js'

const base = (o = {}) => ({ unit: 'kg', bodyweight: [], restingHr: [], ...o })

describe('mergeHealth', () => {
  it('adds a weight and a resting HR', () => {
    const r = mergeHealth(base(), { weights: [{ d: '2026-10-01', kg: 80.04, t: 1 }], restingHr: [{ d: '2026-10-01', bpm: 54.4, t: 1 }] })
    expect(r.bodyweight).toEqual([{ d: '2026-10-01', w: 80, t: 1 }])
    expect(r.restingHr).toEqual([{ d: '2026-10-01', bpm: 54, t: 1 }])
    expect(r.added).toBe(2)
  })
  it('converts kg to lb when the unit is lb', () => {
    const r = mergeHealth(base({ unit: 'lb' }), { weights: [{ d: '2026-10-01', kg: 100, t: 1 }] })
    expect(r.bodyweight[0].w).toBeCloseTo(220.5, 1)
  })
  it('keeps an existing manual entry for the same day', () => {
    const r = mergeHealth(base({ bodyweight: [{ d: '2026-10-01', w: 79 }] }), { weights: [{ d: '2026-10-01', kg: 80, t: 1 }] })
    expect(r.bodyweight).toEqual([{ d: '2026-10-01', w: 79 }])
    expect(r.added).toBe(0)
  })
  it('keeps the latest sample when Health has several in one day', () => {
    const r = mergeHealth(base(), { weights: [{ d: '2026-10-01', kg: 81, t: 5 }, { d: '2026-10-01', kg: 80, t: 9 }] })
    expect(r.bodyweight).toEqual([{ d: '2026-10-01', w: 80, t: 9 }])
  })
  it('ignores non-finite and non-positive values', () => {
    const r = mergeHealth(base(), { weights: [{ d: '2026-10-01', kg: NaN, t: 1 }], restingHr: [{ d: '2026-10-01', bpm: 0, t: 1 }] })
    expect(r.added).toBe(0)
  })
  it('does not mutate the state', () => {
    const S = base()
    const copy = JSON.stringify(S)
    mergeHealth(S, { weights: [{ d: '2026-10-01', kg: 80, t: 1 }] })
    expect(JSON.stringify(S)).toBe(copy)
  })
})
