// What the iOS home-screen widget shows, as a small JSON-able object (see widget-sync.js).
import { effectiveRoutines, nextTrainingDay } from './history.js'
import { queueView, weekTally } from './queue.js'
import { topLifts } from './dashboard.js'
import { weekKey, weekStartOf, isoOf } from './format.js'

const r1 = n => Math.round(n * 10) / 10
const mean = a => a.reduce((s, x) => s + x, 0) / a.length

function nextOf(S, today) {
  const q = queueView(S, today)?.items.find(i => i.state === 'next')
  if (q) return { name: q.name, on: today }
  const [first] = effectiveRoutines(S, today)
  if (first?.ex?.length && !S.workouts.some(w => w.d === today)) return { name: first.name, on: today }
  const n = nextTrainingDay(S, today)
  return n ? { name: n.routine.name, on: n.iso } : null
}

function progressOf(S, now, ws) {
  const lifts = topLifts(S, 5, 56, now).filter(l => l.points.length > 1)
  if (!lifts.length) return null
  const pct = mean(lifts.map(l => (l.points.at(-1).y / l.points[0].y - 1) * 100))
  const weeks = {} // week start iso -> each lift's last value that week, vs its first point
  for (const l of lifts) {
    const last = {}
    for (const p of l.points) last[weekKey(isoOf(new Date(p.t)), ws)] = (p.y / l.points[0].y) * 100
    for (const k in last) (weeks[k] ||= []).push(last[k])
  }
  const points = Object.keys(weeks).sort().slice(-8).map(k => r1(mean(weeks[k])))
  // JSON.stringify turns NaN/Infinity into null, which the Swift decoder rejects (whole widget goes empty)
  if (!Number.isFinite(pct) || !points.every(Number.isFinite)) return null
  return { pct: r1(pct), points }
}

export function widgetSnapshot(S, today, now) {
  const ws = weekStartOf(S)
  return {
    v: 1,
    next: nextOf(S, today),
    week: { ...weekTally(S, today), start: weekKey(today, ws) },
    progress: progressOf(S, now, ws),
  }
}
