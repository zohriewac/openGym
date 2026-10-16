import { describe, expect, it } from 'vitest'
import { parseBodyweight, parseImport } from './import-csv.js'

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

describe('Garmin Connect weight export (CSV)', () => {
  const head = 'Date,Time,Weight,Change,BMI,Body Fat,Skeletal Muscle Mass,Bone Mass,Body Water'
  const csv = [head,
    '"Jan 6, 2025","7:32 AM","82.1 kg","-0.3 kg","24.8","18.5 %","","",""',
    '"Jan 5, 2025","6:15 PM","181.0 lbs","","","","","",""'].join('\n')

  it('reads the clock time into t, so morning and evening weigh-ins split correctly', () => {
    const p = parseBodyweight(csv, { unit: 'kg' })
    expect(p.source).toBe('Garmin Connect')
    expect(p.bodyweight.map(b => b.d)).toEqual(['2025-01-05', '2025-01-06'])
    const [eve, morn] = p.bodyweight.map(b => new Date(b.t))
    expect([eve.getHours(), eve.getMinutes()]).toEqual([18, 15])
    expect([morn.getHours(), morn.getMinutes()]).toEqual([7, 32])
  })

  it('converts each row from the unit written in its own cell', () => {
    expect(parseBodyweight(csv, { unit: 'kg' }).bodyweight.map(b => b.w)).toEqual([82.1, 82.1])
    expect(parseBodyweight(csv, { unit: 'lb' }).bodyweight.map(b => b.w)).toEqual([181, 181])
  })

  it('tolerates a title line above the header and 24-hour times', () => {
    const p = parseBodyweight(`Weight\n${head}\n"Jan 6, 2025","17:05","80 kg","","","","","",""`, { unit: 'kg' })
    expect(new Date(p.bodyweight[0].t).getHours()).toBe(17)
  })

  it('is picked up by the file sniffer', () => {
    expect(parseImport(csv, { unit: 'kg' }).kind).toBe('bodyweight')
  })
})
