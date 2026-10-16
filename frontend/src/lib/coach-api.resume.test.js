// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
const mem = new Map()
const fake = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() }
vi.stubGlobal('localStorage', fake)

beforeEach(() => { fake.clear(); vi.resetModules() })

describe('the awaited run after a WebView reload', () => {
  it('is restored once and settled once, so the reply is written a single time', async () => {
    fake.setItem('coach_awaited_v1', 'job-9')
    const m = await import('./coach-api.js')
    expect(m.awaitedJob()).toBe('job-9')
    m.settleAwaited('job-9')
    expect(m.awaitedJob()).toBe(null)
    expect(fake.getItem('coach_awaited_v1')).toBe(null)
    vi.resetModules()
    expect((await import('./coach-api.js')).awaitedJob()).toBe(null)
  }, 30000)
})
