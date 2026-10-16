// Weigh-ins read back week by week (Discord 'Weight'). From one morning to the next, body weight
// moves with water, salt and the last meal by more than it moves in a month, so the number worth
// following is the week's mean — the one a single weigh-in on the card cannot give you.
import { weekKey } from './format.js'
import { LB_TO_KG } from './recovery.js'

/**
 * The weigh-ins grouped into weeks, newest week first. Each week carries its mean, how many
 * weigh-ins it holds, the change of its mean from the week before it that has any (null for the
 * first), and its entries newest first. `ws` is the first day of the week (weekStartOf), so the
 * weeks are the ones the calendar and the week strip show. The stored order is not relied on,
 * and an entry with no day or no weight is skipped rather than averaged in as 0.
 * Returns [{ key, avg, n, delta, entries }], `key` being the iso date the week starts on.
 */
export function weeklyWeights(bodyweight, ws) {
  const byWeek = new Map()
  for (const b of Array.isArray(bodyweight) ? bodyweight : []) {
    if (!b?.d || !(Number(b.w) > 0)) continue
    const key = weekKey(b.d, ws)
    if (!byWeek.has(key)) byWeek.set(key, [])
    byWeek.get(key).push(b)
  }
  const weeks = [...byWeek.keys()].sort().map(key => {
    const entries = byWeek.get(key).slice().sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0))
    return { key, n: entries.length, avg: entries.reduce((sum, b) => sum + Number(b.w), 0) / entries.length, entries }
  })
  weeks.forEach((week, i) => { week.delta = i ? week.avg - weeks[i - 1].avg : null })
  return weeks.reverse()
}

// Weighed before 10:00, by when the entry was written (`t`); an entry with no `t` (an import)
// has no known time of day and counts as later.
export const isMorningWeighIn = b => !!b.t && new Date(b.t).getHours() < 10

/**
 * The weigh-ins as chart points {t, y, d}: one per day, oldest first, placed on the day they
 * were weighed (`d`). `t` is when the entry was written, so a back-dated entry or an Apple
 * Health sample would otherwise land on the wrong spot. A day logged twice keeps the entry
 * written last; an entry with no day or no weight is dropped. `since` (ms) drops older days.
 * `keep(entry)` narrows to the entries wanted, e.g. isMorningWeighIn.
 */
export function weightSeries(bodyweight, since = 0, keep = () => true) {
  const byDay = new Map()
  for (const b of Array.isArray(bodyweight) ? bodyweight : []) {
    if (!b?.d || !(Number(b.w) > 0) || !keep(b)) continue
    const cur = byDay.get(b.d)
    if (!cur || (b.t || 0) >= (cur.t || 0)) byDay.set(b.d, b)
  }
  return [...byDay.values()]
    .map(b => ({ t: new Date(b.d).getTime(), y: Number(b.w), d: b.d }))
    .filter(p => Number.isFinite(p.t) && p.t > since)
    .sort((a, b) => a.t - b.t)
}

// The user's own last registered bodyweight, in kg: the body-mass part of a bodyweight
// exercise's load for fatigue and for estimated effort, so both read the same set the same way.
export function bodyweightKgOf(S) {
  const entries = S.bodyweight || []
  if (!entries.length) return null
  const last = entries.slice().sort((a, b) => String(a.d).localeCompare(String(b.d))).at(-1)
  if (!last || !(last.w > 0)) return null
  return S.unit === 'lb' ? last.w * LB_TO_KG : last.w
}
