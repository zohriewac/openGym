// Picking a Coach run back up after the app was suspended.
//
// iOS freezes the WebView when the phone locks: timers stop, and a request in flight is dropped
// or never answered. The server finishes the job regardless (api/coach/jobs.js), so the client
// only has to remember which run it is waiting for and ask again when it is back on screen.

const KEY = 'coach_awaited_v1'
const store = () => { try { return globalThis.localStorage } catch { return null } }

/** The run this app started and has not written a reply for yet; survives a WebView reload. */
export const loadAwaited = () => { try { return store()?.getItem(KEY) || null } catch { return null } }
export const saveAwaited = id => {
  try { id ? store()?.setItem(KEY, id) : store()?.removeItem(KEY) } catch { /* private mode: in-memory only */ }
}

/** One id per user action, kept across the retry so the server can tell a repeat from a new ask. */
export const newRequestId = () => {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

/** POST a start with a request id; if the connection died (no HTTP status), try once more with
 *  the same id — the server returns the job it already started instead of a second one. */
export async function startOnce(send, tries = 2) {
  const requestId = newRequestId()
  for (let i = 1; ; i++) {
    try { return await send(requestId) }
    catch (e) { if (e?.status != null || i >= tries) throw e }
  }
}

/** Run `fn(hiddenMs)` whenever the page comes back to the foreground; returns the unsubscribe. */
export function onForeground(fn, doc = globalThis.document, now = Date.now) {
  if (!doc?.addEventListener) return () => {}
  let hiddenAt = null
  const h = () => {
    if (doc.visibilityState !== 'visible') { hiddenAt = hiddenAt ?? now(); return }
    const away = hiddenAt == null ? 0 : now() - hiddenAt
    hiddenAt = null
    fn(away)
  }
  doc.addEventListener('visibilitychange', h)
  return () => doc.removeEventListener('visibilitychange', h)
}
