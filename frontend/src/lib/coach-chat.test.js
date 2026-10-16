// The client side of the Coach conversation: the SSE reader, the streamed send with its JSON
// fallback and typed failures, the wait for a reply after a drop, and the phone's own-key turn.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./api.js', () => ({
  api: vi.fn(),
  apiTarget: () => ({ url: '/api/coach/chat', headers: { Authorization: 'Bearer t' } })
}))
const { parseSSE, sendChat, waitForReply } = await import('./coach-chat.js')

const frame = o => 'data: ' + JSON.stringify(o) + '\n\n'
const streamOf = chunks => new ReadableStream({
  start(c) { const enc = new TextEncoder(); chunks.forEach(s => c.enqueue(enc.encode(s))); c.close() }
})
const sse = chunks => new Response(streamOf(chunks), { status: 200, headers: { 'content-type': 'text/event-stream' } })
const jsonRes = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('parseSSE', () => {
  it('returns complete events and keeps the unfinished tail', () => {
    const a = parseSSE(frame({ type: 'delta', text: 'a' }) + 'data: {"type":"del')
    expect(a.events).toEqual([{ type: 'delta', text: 'a' }])
    expect(a.rest).toBe('data: {"type":"del')
  })
  it('skips comments and garbage', () => {
    expect(parseSSE(': ping\n\ndata: nope\n\n' + frame({ type: 'done' })).events).toEqual([{ type: 'done' }])
  })
})

describe('sendChat', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('streams deltas in order, even when a frame is split across chunks, then resolves with the stored message', async () => {
    const msg = { id: 'm1', role: 'coach', text: 'Hello there', at: 1 }
    const whole = frame({ type: 'start', id: 'm1' }) + frame({ type: 'delta', text: 'Hello ' }) + frame({ type: 'delta', text: 'there' }) + frame({ type: 'done', message: msg })
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(sse([whole.slice(0, 40), whole.slice(40, 90), whole.slice(90)]))
    const got = []
    const r = await sendChat('hi', { lang: 'en', onStart: id => got.push('start:' + id), onDelta: d => got.push(d) })
    expect(got).toEqual(['start:m1', 'Hello ', 'there'])
    expect(r.message).toEqual(msg)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/coach/chat')
    expect(init.headers.Authorization).toBe('Bearer t')
    expect(JSON.parse(init.body)).toEqual({ message: 'hi', lang: 'en', stream: true })
  })

  it('accepts a plain JSON reply from a server or proxy that did not stream', async () => {
    const msg = { id: 'm', role: 'coach', text: 'ok', at: 1 }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonRes(200, { message: msg }))
    expect((await sendChat('hi')).message).toEqual(msg)
  })

  it('turns a refusal into an Error with the server class and status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonRes(429, { error: 'slow down', code: 'rate', retryAfter: 30 }))
    await expect(sendChat('hi')).rejects.toMatchObject({ code: 'rate', status: 429, message: 'slow down' })
  })

  it('an error event after the stream began carries the partial text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sse([frame({ type: 'start', id: 'x' }), frame({ type: 'delta', text: 'Part' }), frame({ type: 'error', code: 'provider', error: 'x', partial: 'Part' })]))
    await expect(sendChat('hi')).rejects.toMatchObject({ code: 'provider', partial: 'Part' })
  })

  it('a stream that ends without done is a network failure that keeps what arrived', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sse([frame({ type: 'delta', text: 'Half' })]))
    await expect(sendChat('hi')).rejects.toMatchObject({ code: 'network', partial: 'Half' })
  })

  it('an abort is "cancelled", an unreachable server is "network"', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'AbortError' }))
    await expect(sendChat('hi')).rejects.toMatchObject({ code: 'cancelled' })
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(sendChat('hi')).rejects.toMatchObject({ code: 'network' })
  })
})

describe('waitForReply', () => {
  it('polls the history until the reply in flight has landed', async () => {
    const answers = [{ busy: true, messages: [1] }, { busy: true, messages: [1] }, { busy: false, messages: [1, 2] }]
    const history = vi.fn(async () => answers.shift())
    const seen = []
    const h = await waitForReply({ history, sleep: async () => {}, onUpdate: x => seen.push(x.messages.length) })
    expect(h.messages).toEqual([1, 2])
    expect(seen).toEqual([1, 1, 2])
  })
})
