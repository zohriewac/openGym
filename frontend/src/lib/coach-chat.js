// The Coach conversation against a server: one message out, the reply streamed back.
//
// The reply arrives as server-sent events when the connection allows it, and as one JSON body
// when it does not (a proxy that buffers, an older server). Either way the caller gets the same
// thing: onDelta pieces as they come, then the stored message — or an Error carrying `.code`
// (the server's class, or 'network'), `.status` and whatever text had arrived as `.partial`.
// The server writes the reply to the profile's history whether or not this connection survives,
// so after a drop the answer is a `chatHistory()` away: `waitForReply` polls until it lands.

import { api, apiTarget } from './api.js'

const POLL_MS = 2000
const GIVE_UP_MS = 5 * 60000

const fail = (message, code, status, partial) => Object.assign(new Error(message), { code, status, partial: partial || '' })

/** Split a buffer into complete `data:` events and the unfinished tail. Pure; tested directly. */
export function parseSSE(buf) {
  const cut = buf.lastIndexOf('\n\n')
  if (cut < 0) return { events: [], rest: buf }
  const events = []
  for (const line of buf.slice(0, cut).split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    try { events.push(JSON.parse(line.slice(5).trim())) } catch { /* a comment or keep-alive */ }
  }
  return { events, rest: buf.slice(cut + 2) }
}

const asError = (body, status) => fail(body?.error || `HTTP ${status}`, body?.code || 'internal', status, body?.partial)

/** Feed every event of `r`'s body to `handle`; whole-text when the body is not a stream. */
async function readEvents(r, handle) {
  const reader = r.body?.getReader?.()
  if (!reader) return handle(parseSSE((await r.text()) + '\n\n').events)
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const p = parseSSE(buf + dec.decode(value, { stream: true }))
    buf = p.rest
    handle(p.events)
  }
  handle(parseSSE(buf + '\n\n').events)
}

/**
 * Send one message to the server and stream the reply.
 * @returns {Promise<{message: {id, role, text, at}}>}
 */
export async function sendChat(message, { lang, onStart, onDelta, signal } = {}) {
  const { url, headers } = apiTarget('/api/coach/chat')
  let r
  try {
    r = await fetch(url, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...headers },
      body: JSON.stringify({ message, lang, stream: true })
    })
  } catch (e) { throw fail(e?.name === 'AbortError' ? 'stopped' : 'network', e?.name === 'AbortError' ? 'cancelled' : 'network', 0) }
  const type = r.headers.get('content-type') || ''
  if (!r.ok || !type.includes('text/event-stream')) {
    const body = await r.json().catch(() => null)
    if (r.ok && body?.message) return { message: body.message }
    throw asError(body, r.status)
  }
  let text = '', done = null, error = null
  const handle = events => events.forEach(ev => {
    if (ev.type === 'start' && onStart) onStart(ev.id)
    else if (ev.type === 'delta') { text += ev.text; if (onDelta) onDelta(ev.text) }
    else if (ev.type === 'done') done = ev.message
    else if (ev.type === 'error') error = ev
  })
  try { await readEvents(r, handle) } catch (e) {
    if (!done && !error) throw fail(e?.name === 'AbortError' ? 'stopped' : 'network', e?.name === 'AbortError' ? 'cancelled' : 'network', 0, text)
  }
  if (error) throw asError(error, 200)
  if (!done) throw fail('network', 'network', 0, text)
  return { message: done }
}

/** After a reload or a dropped connection: poll the history until the reply in flight lands. */
export async function waitForReply({ onUpdate, signal, history = () => api('/api/coach/chat'), sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const until = Date.now() + GIVE_UP_MS
  for (;;) {
    const h = await history()
    if (onUpdate) onUpdate(h)
    if (!h.busy || signal?.aborted || Date.now() > until) return h
    await sleep(POLL_MS)
  }
}
