import { describe, expect, it } from 'vitest'
import { parseBodyweight } from './import-csv.js'

const record = (day, value, unit) => `<Record type="HKQuantityTypeIdentifierBodyMass" unit="${unit}" value="${value}" startDate="2026-09-${day} 08:00:00 +0000"/>`

describe('Apple Health body-weight units', () => {
  it.each([
    ['kg', [80, 81.6]],
    ['lb', [176.4, 180]],
  ])('converts each record into %s independently', (unit, expected) => {
    const parsed = parseBodyweight(record('01', 80, 'kg') + record('02', 180, 'lb'), { unit })
    expect(parsed.bodyweight.map(b => b.w)).toEqual(expected)
    expect(parsed.converted).toBe(true)
    expect(parsed.fileUnit).toBe('kg / lb')
  })

  it('does not let record order change another day’s weight', () => {
    const kg = record('01', 80, 'kg'), lb = record('02', 180, 'lb')
    expect(parseBodyweight(kg + lb).bodyweight).toEqual(parseBodyweight(lb + kg).bodyweight)
  })

  it('preserves conversion for single-unit XML and CSV exports', () => {
    expect(parseBodyweight(record('01', 180, 'lb')).bodyweight[0].w).toBe(81.6)
    expect(parseBodyweight('Date,Weight (lbs)\n2026-09-01,180').bodyweight[0].w).toBe(81.6)
    expect(parseBodyweight(record('01', 80, 'kg')).converted).toBe(false)
  })
})

describe('weigh-in time of day (decides the before/after 10:00 split)', () => {
  it('keeps a CSV row\'s clock time in local time, and no `t` when the file has none', () => {
    const r = parseBodyweight('Date,Weight (kg)\n2026-09-01 07:30,80\n2026-09-02,81').bodyweight
    expect(new Date(r[0].t).getHours()).toBe(7)
    expect('t' in r[1]).toBe(false)
  })
})
