import { describe, expect, it } from 'vitest'
import { formatLength, fromMm, toMm } from '../src/units'

describe('units', () => {
  it('converts inches to mm', () => expect(toMm(3, 'in')).toBeCloseTo(76.2))
  it('passes mm through', () => expect(toMm(12.5, 'mm')).toBe(12.5))
  it('round-trips without drift', () => {
    let mm = 8.89
    for (let i = 0; i < 50; i++) mm = toMm(fromMm(mm, 'in'), 'in')
    expect(mm).toBeCloseTo(8.89, 10)
  })
  it('formats', () => {
    expect(formatLength(76.2, 'in')).toBe('3.00 in')
    expect(formatLength(76.2, 'mm')).toBe('76.2 mm')
  })
})
