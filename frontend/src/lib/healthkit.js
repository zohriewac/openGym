// Merge Apple Health samples into state: pure, so it is testable without a device.
const LB_PER_KG = 2.20462

// Newest valid sample per day; a day the state already has is never overwritten.
const latestPerDay = (xs, key) => {
  const m = new Map()
  for (const x of xs || []) {
    if (!x?.d || !(Number.isFinite(x[key]) && x[key] > 0)) continue
    const cur = m.get(x.d)
    if (!cur || (x.t || 0) >= (cur.t || 0)) m.set(x.d, x)
  }
  return m
}

/** weights: [{d, kg, t}], restingHr: [{d, bpm, t}] → new arrays + how many days were added. */
export function mergeHealth(S, { weights = [], restingHr = [] } = {}) {
  const bodyweight = [...(S.bodyweight || [])]
  const hr = [...(S.restingHr || [])]
  const bwDays = new Set(bodyweight.map(e => e.d))
  const hrDays = new Set(hr.map(e => e.d))
  let added = 0
  for (const [d, x] of latestPerDay(weights, 'kg')) {
    if (bwDays.has(d)) continue
    bodyweight.push({ d, w: Math.round((S.unit === 'lb' ? x.kg * LB_PER_KG : x.kg) * 10) / 10, t: x.t })
    added++
  }
  for (const [d, x] of latestPerDay(restingHr, 'bpm')) {
    if (hrDays.has(d)) continue
    hr.push({ d, bpm: Math.round(x.bpm), t: x.t })
    added++
  }
  const byDay = (a, b) => (a.d < b.d ? -1 : 1)
  return { bodyweight: bodyweight.sort(byDay), restingHr: hr.sort(byDay), added }
}
