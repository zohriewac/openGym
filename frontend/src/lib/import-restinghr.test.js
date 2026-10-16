import { describe, it, expect } from 'vitest'
import { parseBodyweight, mergeImport } from './import-csv.js'

const xml = `<HealthData>
<Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="2026-10-01 07:30:00 +0200" value="80.2"/>
<Record type="HKQuantityTypeIdentifierRestingHeartRate" unit="count/min" startDate="2026-10-01 09:00:00 +0200" value="54"/>
<Record type="HKQuantityTypeIdentifierRestingHeartRate" unit="count/min" startDate="2026-10-02 09:00:00 +0200" value="0"/>
</HealthData>`

describe('Apple Health export: resting heart rate', () => {
  it('reads resting HR next to body mass and drops a zeroed record', () => {
    const p = parseBodyweight(xml, { unit: 'kg' })
    expect(p.restingHr.map(h => [h.d, h.bpm])).toEqual([['2026-10-01', 54]])
  })
  it('merges it once; a second import adds nothing', () => {
    const S = { bodyweight: [], restingHr: [] }
    const p = parseBodyweight(xml, { unit: 'kg' })
    expect(mergeImport(S, p).hrAdded).toBe(1)
    expect(mergeImport(S, p).hrAdded).toBe(0)
    expect(S.restingHr).toHaveLength(1)
  })
  it('accepts an export that has resting HR but no weigh-ins', () => {
    const onlyHr = xml.split('\n').filter(l => !l.includes('BodyMass')).join('\n')
    expect(parseBodyweight(onlyHr).restingHr).toHaveLength(1)
  })
})
