import { describe, it, expect, vi, afterEach } from 'vitest'
import { pushWidget } from './widget-sync.js'

const S = { workouts: [], routines: [], week: {}, dayPlan: {}, bodyweight: [], unit: 'kg', weekStart: 1 }
afterEach(() => { delete globalThis.window })

describe('pushWidget', () => {
  it('no host', () => {
    expect(pushWidget(S)).toBe(false)
  })
  it('posts once per change', () => {
    const postMessage = vi.fn()
    globalThis.window = { webkit: { messageHandlers: { widget: { postMessage } } } }
    expect(pushWidget(S, '2026-10-15')).toBe(true)
    expect(pushWidget(S, '2026-10-15')).toBe(false)
    expect(pushWidget({ ...S, routines: [{ id: 'a', name: 'A', ex: [{ id: 'x' }] }], week: { 4: ['a'] } }, '2026-10-15')).toBe(true)
    expect(postMessage).toHaveBeenCalledTimes(2)
    expect(JSON.parse(postMessage.mock.calls[0][0]).v).toBe(1)
  })
})
