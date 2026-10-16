import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  platform: 'ios',
  request: vi.fn(async () => ({ status: 200, data: '{}' }))
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => native.platform
  },
  CapacitorHttp: { request: native.request }
}))

const { nativeFetch } = await import('./capacitor-fetch.js')

describe('native Coach transport timeouts', () => {
  beforeEach(() => {
    native.platform = 'ios'
    native.request.mockClear()
  })

  it('lets an iOS request outlast a slow local Coach job', async () => {
    await nativeFetch('http://ollama.test/v1/chat/completions', { method: 'POST', body: '{}' })

    expect(native.request).toHaveBeenCalledWith(expect.objectContaining({
      connectTimeout: 40 * 60000,
      readTimeout: 40 * 60000
    }))
  })

  it('keeps Android connection failures short without shortening response reads', async () => {
    native.platform = 'android'

    await nativeFetch('http://ollama.test/v1/chat/completions', { method: 'POST', body: '{}' })

    expect(native.request).toHaveBeenCalledWith(expect.objectContaining({
      connectTimeout: 30000,
      readTimeout: 40 * 60000
    }))
  })
})

describe('the SwiftUI shell transport', () => {
  it('sends the call through the native http handler and shapes the reply like a fetch response', async () => {
    const post = vi.fn(async () => ({ status: 200, body: '{"ok":true}' }))
    vi.stubGlobal('window', { webkit: { messageHandlers: { http: { postMessage: post } } } })
    try {
      const res = await nativeFetch('https://api.example.test/v1/x', { method: 'POST', headers: { a: 'b' }, body: '{"q":1}' })
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://api.example.test/v1/x', method: 'POST', headers: { a: 'b' }, body: '{"q":1}' }))
      expect(res.ok).toBe(true)
      expect(await res.json()).toEqual({ ok: true })
    } finally { vi.unstubAllGlobals() }
  })
})
