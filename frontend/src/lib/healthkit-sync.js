// Apple Health → state, via the native `health` message handler of the iOS shell (OpenGym/).
// Absent in browsers, Capacitor and Android, where isHealthKit() is false and nothing runs.
import { mergeHealth } from './healthkit.js'

const KEY = 'opengym_healthkit_on'
const DAYS = 90
const MIN_GAP_MS = 10 * 60 * 1000

export const isHealthKit = () => typeof window !== 'undefined' && !!window.webkit?.messageHandlers?.health

const flag = {
  get: () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } },
  set: () => { try { localStorage.setItem(KEY, '1') } catch { /* private mode: reconnect next launch */ } },
}
export const healthKitOn = flag.get

let busy = null
let last = 0

/**
 * Read the last 90 days from Health and merge them in. status: 'unsupported' | 'unavailable' |
 * 'ok' | 'failed'. A denied read comes back empty ('ok', added 0): iOS hides the difference.
 */
export function pullHealthKit(getS, update) {
  if (!isHealthKit()) return Promise.resolve({ status: 'unsupported', added: 0 })
  if (busy) return busy
  busy = (async () => {
    try {
      const r = await window.webkit.messageHandlers.health.postMessage({ days: DAYS })
      if (r?.status !== 'ok') return { status: 'unavailable', added: 0 }
      flag.set()
      last = Date.now()
      const m = mergeHealth(getS(), r)
      if (m.added) update(s => { s.bodyweight = m.bodyweight; s.restingHr = m.restingHr })
      return { status: 'ok', added: m.added }
    } catch {
      return { status: 'failed', added: 0 } // locked phone, no access: try again next foreground
    } finally { busy = null }
  })()
  return busy
}

/** Keep pulling on launch and whenever the app comes back, but only once the person connected. */
export function initHealthKitSync(getS, update) {
  if (!isHealthKit() || typeof document === 'undefined') return
  const tick = () => {
    if (document.visibilityState === 'visible' && flag.get() && Date.now() - last > MIN_GAP_MS) pullHealthKit(getS, update)
  }
  document.addEventListener('visibilitychange', tick)
  setTimeout(tick, 3000)
}
