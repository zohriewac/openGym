import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadAwaited, saveAwaited, startOnce, onForeground } from './coach-resume.js'
const mem = new Map()
const fake = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() }
vi.stubGlobal('localStorage', fake)

beforeEach(() => fake.clear())

describe('awaited run survives a reload', () => {
  it('round-trips and clears', () => {
    saveAwaited('abc')
    expect(loadAwaited()).toBe('abc')
    saveAwaited(null)
    expect(loadAwaited()).toBe(null)
  })
})

describe('startOnce', () => {
  it('retries a dead connection with the same request id, once', async () => {
    const ids = []
    const send = vi.fn(async id => { ids.push(id); if (ids.length === 1) throw new Error('network'); return { job: { id: 'j1' } } })
    expect(await startOnce(send)).toEqual({ job: { id: 'j1' } })
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
  })
  it('does not retry a refusal the server answered', async () => {
    const send = vi.fn(async () => { throw Object.assign(new Error('busy'), { status: 409 }) })
    await expect(startOnce(send)).rejects.toThrow('busy')
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('onForeground', () => {
  it('fires on return with how long the page was away, not on hide', () => {
    const doc = new EventTarget(); doc.visibilityState = 'visible'
    let t = 1000; const fn = vi.fn()
    const off = onForeground(fn, doc, () => t)
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'))
    expect(fn).not.toHaveBeenCalled()
    t = 31000; doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'))
    expect(fn).toHaveBeenCalledWith(30000)
    off(); doc.dispatchEvent(new Event('visibilitychange'))
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
