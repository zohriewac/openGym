import { workoutVolume, workoutDay, workoutAt } from './history.js'
import { e1rmSeries, bestSetOf, formulaOf } from './onerm.js'
import { weekKey, weekStartOf, isoOf, todayISO, exerciseNameText } from './format.js'
import { fatigueStateOf } from './recovery-view.js'
import { EXIDX } from './exercises.js'

// What the Home dashboard reads back from a logged history. Pure; Home only renders it.
const DAY = 864e5
const nameOf = id => (EXIDX[id] ? exerciseNameText(EXIDX[id]) : id)
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length

export function weekVolume(S, today = todayISO()) {
  const ws = weekStartOf(S), cur = weekKey(today, ws)
  const d = new Date(today + 'T12:00'); d.setDate(d.getDate() - 7)
  const prevKey = weekKey(isoOf(d), ws)
  let c = 0, p = 0
  for (const w of S.workouts || []) {
    const day = workoutDay(w); if (!day) continue
    const k = weekKey(day, ws)
    if (k === cur) c += workoutVolume(w); else if (k === prevKey) p += workoutVolume(w)
  }
  return { cur: c, prev: p, delta: p ? (c - p) / p : null }
}

// `weeks` rows of 7 local days, oldest first, the last row being the current week.
export function trainingWeeks(S, weeks = 12, today = todayISO()) {
  const ws = weekStartOf(S)
  const first = new Date(weekKey(today, ws) + 'T12:00')
  first.setDate(first.getDate() - (weeks - 1) * 7)
  const count = {}
  for (const w of S.workouts || []) { const day = workoutDay(w); if (day) count[day] = (count[day] || 0) + 1 }
  const days = []
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(first); d.setDate(first.getDate() + i)
    const iso = isoOf(d)
    days.push({ iso, n: count[iso] || 0 })
  }
  let weeksTrained = 0
  for (let i = 0; i < weeks; i++) if (days.slice(i * 7, i * 7 + 7).some(x => x.n)) weeksTrained++
  return { days, weeksTrained }
}

export function topLifts(S, n = 3, days = 56, now = Date.now()) {
  const since = now - days * DAY, sessions = {}
  for (const w of S.workouts || []) {
    if (!(workoutAt(w) >= since)) continue
    const ids = new Set((w.entries || []).map(e => e?.id).filter(Boolean))
    ids.forEach(id => { sessions[id] = (sessions[id] || 0) + 1 })
  }
  return Object.keys(sessions).sort((a, b) => sessions[b] - sessions[a])
    .map(exId => {
      const points = e1rmSeries(S, exId).filter(p => p.t >= since)
      if (!points.length) return null
      const est = points.at(-1).y
      return { exId, name: nameOf(exId), est, delta: points.length > 1 ? est - points[0].y : null, points }
    })
    .filter(Boolean).slice(0, n)
}

// A set is a record only when an earlier best exists and it beats it (same rule as is1RMRecord).
export function recentPRs(S, n = 3, days = 30, now = Date.now()) {
  const since = now - days * DAY, formula = formulaOf(S), best = {}, latest = {}
  const ws = (S.workouts || []).filter(w => Number.isFinite(workoutAt(w))).sort((a, b) => workoutAt(a) - workoutAt(b))
  for (const w of ws) {
    for (const e of w.entries || []) {
      const b = e?.id && bestSetOf(e, formula)
      if (!b) continue
      const prev = best[e.id]
      if (prev !== undefined && b.est > prev && workoutAt(w) >= since) latest[e.id] = { exId: e.id, name: nameOf(e.id), est: b.est, w: b.w, r: b.r, d: workoutDay(w), at: workoutAt(w) }
      if (prev === undefined || b.est > prev) best[e.id] = b.est
    }
  }
  return Object.values(latest).sort((a, b) => b.at - a.at).slice(0, n).map(({ at, ...p }) => p)
}

export function trailingAvg(points, k = 7) {
  return points.map((p, i) => ({ ...p, y: mean(points.slice(Math.max(0, i - k + 1), i + 1).map(q => q.y)) }))
}

export function restingHrSummary(restingHr = [], now = Date.now()) {
  const rows = (Array.isArray(restingHr) ? restingHr : []).filter(r => r?.bpm > 0 && Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t)
  if (!rows.length) return null
  const last = rows.at(-1)
  const cur = rows.filter(r => r.t > now - 7 * DAY && r.t <= now), prev = rows.filter(r => r.t > now - 14 * DAY && r.t <= now - 7 * DAY)
  const avg7 = cur.length ? mean(cur.map(r => r.bpm)) : last.bpm
  return { last: { d: last.d, bpm: last.bpm }, avg7, delta: cur.length && prev.length ? avg7 - mean(prev.map(r => r.bpm)) : null }
}

export function recoveryGroups(fatigue = {}) {
  const g = { ready: [], recovering: [], fatigued: [] }
  for (const [slug, v] of Object.entries(fatigue)) g[fatigueStateOf(v)]?.push(slug)
  return g
}
