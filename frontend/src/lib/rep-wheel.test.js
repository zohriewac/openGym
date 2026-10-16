import { describe, expect, it } from 'vitest'
import { valueAtOffset, offsetOfValue } from './rep-wheel.js'

describe('valueAtOffset', () => {
  it('maps offsets to values', () => {
    expect(valueAtOffset(0, 44)).toBe(0)
    expect(valueAtOffset(440, 44)).toBe(10)
  })
  it('rounds at the half item', () => {
    expect(valueAtOffset(21, 44)).toBe(0)
    expect(valueAtOffset(22, 44)).toBe(1)
    expect(valueAtOffset(65, 44)).toBe(1)
  })
  it('clamps below and above the range', () => {
    expect(valueAtOffset(-50, 44)).toBe(0)
    expect(valueAtOffset(99999, 44)).toBe(100)
    expect(valueAtOffset(99999, 44, 0, 20)).toBe(20)
  })
  it('honours min and step', () => {
    expect(valueAtOffset(88, 44, 0, 100, 2)).toBe(4)
    expect(valueAtOffset(99999, 44, 0, 99, 2)).toBe(98)
    expect(valueAtOffset(44, 44, 5)).toBe(6)
  })
  it('survives a not-yet-measured item', () => {
    expect(valueAtOffset(100, 0)).toBe(0)
    expect(valueAtOffset(NaN, 44)).toBe(0)
  })
})

describe('offsetOfValue', () => {
  it('is the inverse on the grid', () => {
    expect(offsetOfValue(7, 44)).toBe(308)
    expect(valueAtOffset(offsetOfValue(8, 44, 0, 100, 2), 44, 0, 100, 2)).toBe(8)
  })
  it('clamps and tolerates empty values', () => {
    expect(offsetOfValue('', 44)).toBe(0)
    expect(offsetOfValue(500, 44)).toBe(4400)
  })
})
