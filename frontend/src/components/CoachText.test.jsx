import { describe, expect, it } from 'vitest'
import { parseBlocks } from './CoachText.jsx'

describe('CoachText.parseBlocks', () => {
  it('groups consecutive bullets and keeps other lines as text', () => {
    expect(parseBlocks('Hi\n- a\n* b\nBye')).toEqual([{ line: 'Hi' }, { ul: ['a', 'b'] }, { line: 'Bye' }])
  })
  it('survives null', () => expect(parseBlocks(null)).toEqual([{ line: '' }]))
})
