// Home-screen widget feed, via the native `widget` message handler of the iOS shell (OpenGym/).
// Absent in browsers, Capacitor and Android, where isWidgetHost() is false and nothing runs.
import { widgetSnapshot } from './widget-snapshot.js'
import { todayISO } from './format.js'

export const isWidgetHost = () => typeof window !== 'undefined' && !!window.webkit?.messageHandlers?.widget

let lastSent = ''

/** Post the snapshot unless it is the one already posted. True if posted. */
export function pushWidget(S, today = todayISO(), now = Date.now()) {
  if (!isWidgetHost()) return false
  try {
    const json = JSON.stringify(widgetSnapshot(S, today, now))
    if (json === lastSent) return false
    window.webkit.messageHandlers.widget.postMessage(json)
    lastSent = json
    return true
  } catch {
    return false // a bad state must never break the app; the widget keeps the old snapshot
  }
}

/** Leaving the app is when the widget gets looked at, so push then (and once after launch). */
export function initWidgetSync(getS) {
  if (!isWidgetHost() || typeof document === 'undefined') return
  const push = () => pushWidget(getS())
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push() })
  document.addEventListener('pagehide', push)
  setTimeout(push, 3000)
  setInterval(push, 30000) // backgrounding may never reach JS; the dedupe makes idle ticks free
}
