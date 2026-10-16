import { describe, it, expect } from 'vitest'
import { widgetSnapshot } from './widget-snapshot.js'

const set = (w, r) => ({ w, r, done: true })
const wo = (d, exId, sets) => ({ id: d + exId, d, start: Date.parse(d + 'T10:00'), end: Date.parse(d + 'T11:00'), entries: [{ id: exId, sets }] })
const S0 = { workouts: [], routines: [], week: {}, dayPlan: {}, bodyweight: [], unit: 'kg', weekStart: 1 }
const TODAY = '2026-10-15' // Thursday
const NOW = Date.parse(TODAY + 'T12:00')
const plan = (workouts = []) => ({
  ...S0, workouts,
  routines: [{ id: 'a', name: 'Push A', ex: [{ id: 'squat' }] }, { id: 'b', name: 'Pull B', ex: [{ id: 'squat' }] }],
  week: { 4: ['a'], 1: ['b'] },
})

describe('widgetSnapshot', () => {
  it('empty state', () => {
    expect(widgetSnapshot(S0, TODAY, NOW)).toEqual({ v: 1, next: null, week: { done: 0, planned: 0, start: '2026-10-12' }, progress: null })
  })
  it("next is today's routine when not yet trained", () => {
    expect(widgetSnapshot(plan(), TODAY, NOW).next).toEqual({ name: 'Push A', on: TODAY })
  })
  it('next skips today once trained today', () => {
    const s = widgetSnapshot(plan([wo(TODAY, 'squat', [set(100, 5)])]), TODAY, NOW)
    expect(s.next).toEqual({ name: 'Pull B', on: '2026-10-19' })
  })
  it('progress averages lifts', () => {
    const S = { ...S0, workouts: [
      wo('2026-09-01', 'bench', [set(100, 1)]), wo('2026-10-13', 'bench', [set(110, 1)]),
      wo('2026-09-01', 'squat', [set(200, 1)]), wo('2026-10-13', 'squat', [set(196, 1)]),
    ] }
    const p = widgetSnapshot(S, TODAY, NOW).progress
    expect(p.pct).toBe(4)
    expect(p.points[0]).toBe(100)
    expect(p.points.length).toBeLessThanOrEqual(8)
  })
  it('single-session lift is ignored', () => {
    const S = { ...S0, workouts: [wo('2026-10-13', 'bench', [set(100, 5)])] }
    expect(widgetSnapshot(S, TODAY, NOW).progress).toBeNull()
  })
})

describe('widgetSnapshot JSON shape (decoded by Snapshot in OpenGymWidget.swift)', () => {
  it('has exactly the keys and types the widget decodes', () => {
    const S = { workouts: [], routines: [{ id: 'a', name: 'A', ex: [{ id: 'x' }] }], week: { 4: ['a'] }, dayPlan: {}, bodyweight: [], unit: 'kg', weekStart: 1 }
    const j = JSON.parse(JSON.stringify(widgetSnapshot(S, '2026-10-15', Date.parse('2026-10-15'))))
    expect(Object.keys(j).sort()).toEqual(['next', 'progress', 'v', 'week'])
    expect(Object.keys(j.week).sort()).toEqual(['done', 'planned', 'start'])
    expect(typeof j.week.done).toBe('number')
    expect(j.week.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(j.next === null || (typeof j.next.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.next.on))).toBe(true)
    expect(j.progress === null || (Number.isFinite(j.progress.pct) && j.progress.points.every(Number.isFinite))).toBe(true)
  })
})
