import { describe, expect, it } from 'vitest'
import { weeklyWeights } from './bodyweight.js'

// Discord 'Weight': every weigh-in, week by week, with the week's mean.
describe('weeklyWeights', () => {
  // 2026-09-07 is a Monday, 2026-09-13 the Sunday after it.
  const log = [
    { d: '2026-09-01', w: 81 },
    { d: '2026-09-03', w: 80 },
    { d: '2026-09-07', w: 80.5 },
    { d: '2026-09-09', w: 79.5 },
    { d: '2026-09-13', w: 79 },
  ]

  it('groups by the profile\'s week, newest week and newest weigh-in first, with means and changes', () => {
    const weeks = weeklyWeights(log, 1)
    expect(weeks.map(w => w.key)).toEqual(['2026-09-07', '2026-08-31'])
    expect(weeks[0]).toMatchObject({ n: 3, avg: 79.66666666666667 })
    expect(weeks[0].entries.map(b => b.d)).toEqual(['2026-09-13', '2026-09-09', '2026-09-07'])
    expect(weeks[1]).toMatchObject({ n: 2, avg: 80.5, delta: null })
    expect(weeks[0].delta).toBeCloseTo(-0.8333, 3)
  })

  it('moves the boundary with a Sunday week start', () => {
    const weeks = weeklyWeights(log, 0)
    expect(weeks.map(w => [w.key, w.n])).toEqual([['2026-09-13', 1], ['2026-09-06', 2], ['2026-08-30', 2]])
  })

  it('compares with the last week that has weigh-ins, not the calendar week before', () => {
    const weeks = weeklyWeights([{ d: '2026-08-03', w: 82 }, { d: '2026-09-07', w: 80 }], 1)
    expect(weeks[0].delta).toBe(-2)
  })

  it('does not rely on the stored order and skips entries it cannot place', () => {
    const weeks = weeklyWeights([{ d: '2026-09-09', w: 79 }, { d: '2026-09-07', w: 81 }, { w: 70 }, { d: '2026-09-08', w: 0 }, null], 1)
    expect(weeks).toHaveLength(1)
    expect(weeks[0]).toMatchObject({ n: 2, avg: 80 })
    expect(weeks[0].entries.map(b => b.d)).toEqual(['2026-09-09', '2026-09-07'])
    expect(weeklyWeights(undefined, 1)).toEqual([])
  })
})

import { weightSeries } from './bodyweight.js'
describe('weightSeries', () => {
  const day = d => new Date(d).getTime()
  it('places entries on their day, not on when they were written, oldest first', () => {
    const r = weightSeries([
      { d: '2026-10-10', w: 80, t: day('2026-10-14') }, // back-dated manual entry
      { d: '2026-10-05', w: 81 },
      { d: '2026-10-08', w: 80.5, t: day('2026-10-08') + 3600e3 },
    ])
    expect(r.map(p => p.d)).toEqual(['2026-10-05', '2026-10-08', '2026-10-10'])
    expect(r[2].t).toBe(day('2026-10-10'))
  })
  it('keeps one point per day, the entry written last', () => {
    const r = weightSeries([{ d: '2026-10-01', w: 80, t: 5 }, { d: '2026-10-01', w: 79, t: 9 }])
    expect(r).toEqual([{ t: day('2026-10-01'), y: 79, d: '2026-10-01' }])
  })
  it('drops bad entries and old days', () => {
    expect(weightSeries([{ d: '2026-10-01', w: 0 }, { w: 80 }, null, { d: 'x', w: 80 }])).toEqual([])
    expect(weightSeries([{ d: '2026-10-01', w: 80 }], day('2026-10-02'))).toEqual([])
  })
})
