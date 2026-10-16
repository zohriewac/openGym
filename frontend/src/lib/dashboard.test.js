import { describe, it, expect } from 'vitest'
import { weekVolume, trainingWeeks, topLifts, recentPRs, trailingAvg, restingHrSummary, recoveryGroups, weekSummary } from './dashboard.js'
import { bodyweightKgOf } from './bodyweight.js'

const set = (w, r) => ({ w, r, done: true })
const wo = (d, exId, sets) => ({ id: d + exId, d, start: Date.parse(d + 'T10:00'), end: Date.parse(d + 'T11:00'), entries: [{ id: exId, sets }] })
const S0 = { workouts: [], bodyweight: [], unit: 'kg', weekStart: 1 }

describe('weekVolume', () => {
  it('compares this week to last week in the user week-start', () => {
    const S = { ...S0, workouts: [wo('2026-10-12', 'bench', [set(100, 5)]), wo('2026-10-06', 'bench', [set(100, 4)])] }
    const v = weekVolume(S, '2026-10-15') // Thu; Monday weeks
    expect(v.cur).toBe(500); expect(v.prev).toBe(400); expect(v.delta).toBeCloseTo(0.25)
  })
  it('null delta when last week is empty', () => {
    expect(weekVolume({ ...S0, workouts: [wo('2026-10-12', 'bench', [set(100, 5)])] }, '2026-10-15').delta).toBeNull()
  })
  it('Sunday week start moves a Sunday workout into the next week', () => {
    const S = { ...S0, weekStart: 0, workouts: [wo('2026-10-11', 'bench', [set(100, 5)])] }
    expect(weekVolume(S, '2026-10-15').cur).toBe(500)
  })
})

describe('trainingWeeks', () => {
  it('is weeks*7 local days, ends in the current week, counts trained weeks', () => {
    const S = { ...S0, workouts: [wo('2026-10-14', 'bench', [set(1, 1)]), wo('2026-09-01', 'bench', [set(1, 1)])] }
    const g = trainingWeeks(S, 12, '2026-10-15')
    expect(g.days).toHaveLength(84)
    expect(g.days.find(x => x.iso === '2026-10-14').n).toBe(1)
    expect(g.weeksTrained).toBe(2)
  })
  it('empty history → 0 weeks, no throw', () => { expect(trainingWeeks(S0, 12, '2026-10-15').weeksTrained).toBe(0) })
})

describe('topLifts / recentPRs', () => {
  const now = Date.parse('2026-10-15T12:00')
  const S = { ...S0, workouts: [
    wo('2026-09-01', 'bench', [set(100, 5)]), wo('2026-10-01', 'bench', [set(105, 5)]),
    wo('2026-10-10', 'squat', [set(140, 3)]),
  ] }
  it('ranks by sessions in window, delta null for one point', () => {
    const l = topLifts(S, 3, 56, now)
    expect(l[0].exId).toBe('bench'); expect(l[0].delta).toBeGreaterThan(0)
    expect(l.find(x => x.exId === 'squat').delta).toBeNull()
  })
  it('a first-ever lift is not a PR; beating a previous best is', () => {
    const p = recentPRs(S, 3, 30, now)
    expect(p.map(x => x.exId)).toEqual(['bench'])
    expect(p[0].d).toBe('2026-10-01')
  })
  it('empty history', () => { expect(topLifts(S0)).toEqual([]); expect(recentPRs(S0)).toEqual([]) })
})

describe('small helpers', () => {
  it('trailingAvg uses available points only', () => {
    expect(trailingAvg([{ y: 80 }, { y: 82 }], 7).map(p => p.y)).toEqual([80, 81])
  })
  it('restingHrSummary null on empty, delta null with one week', () => {
    expect(restingHrSummary([])).toBeNull()
    const r = restingHrSummary([{ d: '2026-10-14', bpm: 58, t: Date.parse('2026-10-14') }], Date.parse('2026-10-15'))
    expect(r.last.bpm).toBe(58); expect(r.delta).toBeNull()
  })
  it('recoveryGroups buckets by fatigueStateOf', () => {
    expect(recoveryGroups({ chest: 0.1, quads: 0.3, back: 0.7 })).toEqual({ ready: ['chest'], recovering: ['quads'], fatigued: ['back'] })
  })
  it('bodyweightKgOf converts lb', () => {
    expect(bodyweightKgOf({ unit: 'lb', bodyweight: [{ d: '2026-10-01', w: 200 }] })).toBeCloseTo(90.718, 2)
    expect(bodyweightKgOf({ unit: 'kg', bodyweight: [] })).toBeNull()
  })
})

describe('weekSummary', () => {
  const base = { ...S0, routines: [], week: {} }
  it('is all zero for an empty state', () => {
    expect(weekSummary(base, '2026-10-15')).toEqual({ sessionsDone: 0, sessionsPlanned: 0, volume: 0, volumePrev: 0, volumeDelta: null, streak: 0, prsThisWeek: 0 })
  })
  it('sums a normal week against the last one and counts its PRs', () => {
    const S = { ...base, workouts: [wo('2026-10-06', 'bench', [set(100, 4)]), wo('2026-10-12', 'bench', [set(100, 5)]), wo('2026-10-14', 'bench', [set(110, 5)])] }
    const r = weekSummary(S, '2026-10-15')
    expect(r).toMatchObject({ sessionsDone: 2, volume: 1050, volumePrev: 400, prsThisWeek: 1 })
    expect(r.volumeDelta).toBeCloseTo(1.625)
  })
  it('delta is null when last week was empty', () => {
    expect(weekSummary({ ...base, workouts: [wo('2026-10-12', 'bench', [set(100, 5)])] }, '2026-10-15').volumeDelta).toBeNull()
  })
})
