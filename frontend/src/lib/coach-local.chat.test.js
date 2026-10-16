// The conversation on a phone with its own key: history kept in the device file, a streamed
// reply read from a transport that hands the body over whole (the native HTTP layer), and the
// failures typed the way the server types them.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const device = { data: null }
vi.mock('./mobile.js', () => ({
  MOBILE: true,
  readJsonFile: async () => device.data,
  writeJsonFile: async (_n, d) => { device.data = JSON.parse(JSON.stringify(d)) }
}))
vi.mock('./coach-secrets.js', () => ({ getApiKey: async () => 'sk-test-1', setApiKey: async () => {}, clearApiKey: async () => {} }))
const wire = { calls: [], reply: null }
const frame = o => 'data: ' + JSON.stringify(o) + '\n\n'
vi.mock('./capacitor-fetch.js', () => ({
  nativeFetch: async (url, init) => {
    wire.calls.push({ url, body: JSON.parse(init.body) })
    const r = wire.reply
    return { ok: r.status < 300, status: r.status, text: async () => r.text, json: async () => JSON.parse(r.text) }
  }
}))

const local = await import('./coach-local.js')
const { _resetCoachDevice } = await import('./coach-device.js')

const S = () => ({ unit: 'kg', routines: [], week: {}, customEx: [], bodyweight: [], workouts: [], coach: { consent: { agreedAt: 'x', version: 1 } } })
const streamOk = (...pieces) => ({ status: 200, text: pieces.map(p => frame({ choices: [{ delta: { content: p } }] })).join('') + 'data: [DONE]\n\n' })

describe('the phone Coach chat', () => {
  beforeEach(() => {
    _resetCoachDevice(); local._resetLocal()
    device.data = { mode: 'byok', provider: 'openai', model: 'gpt-t', baseUrl: null }
    wire.calls = []; wire.reply = streamOk('Hel', 'lo')
  })

  it('streams the reply, keeps both turns, and sends the history with the next message', async () => {
    const deltas = []
    const r = await local.localChatSend(S(), 'how am I doing?', { onDelta: d => deltas.push(d) })
    expect(deltas).toEqual(['Hel', 'lo'])
    expect(r.message.text).toBe('Hello')
    const first = wire.calls[0].body
    expect(first.stream).toBe(true)
    expect(first.messages[0].role).toBe('system')
    expect(first.messages[0].content).toMatch(/chatting with one lifter/)
    expect(first.response_format).toBeUndefined()

    await local.localChatSend(S(), 'and legs?', { onDelta: () => {} })
    expect(wire.calls[1].body.messages.slice(1).map(m => m.role)).toEqual(['user', 'assistant', 'user'])
    const h = await local.localChatHistory()
    expect(h.messages.map(m => m.role)).toEqual(['user', 'coach', 'user', 'coach'])
    expect(h.busy).toBe(false)
  })

  it('a refused key is "auth" with the provider words for the operator, and the question stays in history', async () => {
    wire.reply = { status: 401, text: JSON.stringify({ error: { message: 'Incorrect API key' } }) }
    await expect(local.localChatSend(S(), 'hi')).rejects.toMatchObject({ code: 'auth', message: expect.stringContaining('Incorrect API key') })
    expect((await local.localChatHistory()).messages.map(m => m.role)).toEqual(['user'])
  })

  it('no consent, no turn; an empty message is refused before anything is spent', async () => {
    await expect(local.localChatSend({ ...S(), coach: {} }, 'hi')).rejects.toMatchObject({ code: 'consent' })
    await expect(local.localChatSend(S(), '  ')).rejects.toMatchObject({ code: 'empty' })
    expect(wire.calls).toHaveLength(0)
  })

  it('the daily chat cap ends the day, and clear empties the history', async () => {
    device.data.chatDaily = { d: new Date().toISOString().slice(0, 10), n: local.LOCAL_CHAT_DAILY_CAP }
    const { todayISO } = await import('./format.js')
    device.data.chatDaily.d = todayISO()
    _resetCoachDevice()
    await expect(local.localChatSend(S(), 'hi')).rejects.toMatchObject({ code: 'cap' })
    await local.localChatClear()
    expect((await local.localChatHistory()).messages).toEqual([])
  })
})
