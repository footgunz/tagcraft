import { describe, expect, it } from 'vitest'
import { normalizeDesign, PRESETS, type Design } from '../src/design'
import { DEFAULT_SHEET, layoutSheet, normalizeSheet, sheetDimensions, type Placement, type Sheet } from '../src/sheet'

const gift = PRESETS[0]
const rect = (width: number, height: number): Design => normalizeDesign({ ...PRESETS[1], width, height })
const custom = (customWidth: number, customHeight: number, more: Partial<Sheet> = {}): Sheet => ({
  ...DEFAULT_SHEET,
  size: 'custom',
  customWidth,
  customHeight,
  margin: 0,
  gap: 0,
  ...more,
})

function footprint(d: Design, p: Placement) {
  const [w, h] = p.rotation === 90 ? [d.height, d.width] : [d.width, d.height]
  return { x0: p.x, y0: p.y, x1: p.x + w, y1: p.y + h }
}

describe('sheet settings', () => {
  it('repairs garbage', () => {
    const s = normalizeSheet({ size: 'tabloid', customWidth: 'x', margin: -3, gap: 1e9, count: 7.6 })
    expect(s).toMatchObject({ size: 'letter', customWidth: 215.9, margin: 0, gap: 25.4, count: 8 })
  })
  it('defaults to as many as fit', () => {
    expect(normalizeSheet(undefined)).toEqual(DEFAULT_SHEET)
    expect(normalizeSheet({ count: null }).count).toBeNull()
  })
  it('clamps custom size to a 12 × 24 in mat', () => {
    expect(normalizeSheet({ size: 'custom', customWidth: 1, customHeight: 5000 })).toMatchObject({ customWidth: 25.4, customHeight: 609.6 })
  })
  it('dimensions come from the preset or the custom size', () => {
    expect(sheetDimensions({ ...DEFAULT_SHEET, size: 'a4' })).toMatchObject({ width: 210, height: 297 })
    expect(sheetDimensions(custom(100, 150))).toEqual({ width: 100, height: 150 })
  })
})

describe('layoutSheet', () => {
  it('gift tag on Letter: turned (15) beats upright (12)', () => {
    // Upright would be 2 columns × 6 rows; turned is 5 × 3.
    const out = layoutSheet(gift, DEFAULT_SHEET)
    expect(out).toHaveLength(15)
    expect(out.every((p) => p.rotation === 90)).toBe(true)
  })
  it('gift tag on a narrow strip: mixed rows beat either grid', () => {
    // 80 mm wide: one upright column of 6, or turned 2 × 3. One upright row
    // above three turned rows of two fits 7.
    const out = layoutSheet(gift, custom(80, 279.4, { gap: 3.175 }))
    expect(out).toHaveLength(7)
    expect(new Set(out.map((p) => p.rotation)).size).toBe(2)
  })
  it('ties go to upright', () => {
    // 1 × 6 upright and 2 × 3 turned both fit 6.
    const out = layoutSheet(rect(100, 50), custom(110, 300))
    expect(out).toHaveLength(6)
    expect(out.every((p) => p.rotation === 0)).toBe(true)
  })
  it('mixes orientations when that fits more', () => {
    // Either grid fits 2; one upright plus a turned strip fits 3.
    const out = layoutSheet(rect(60, 40), custom(100, 100))
    expect(out).toHaveLength(3)
    expect(new Set(out.map((p) => p.rotation)).size).toBe(2)
  })
  it('fits exactly, without losing a tag to rounding', () => {
    expect(layoutSheet(rect(50, 50), custom(100, 50))).toHaveLength(2)
    expect(layoutSheet(rect(25.4, 25.4), custom(76.2 + 2 * 3.175, 25.4, { gap: 3.175 }))).toHaveLength(3)
  })
  it('is empty when nothing fits, even turned', () => {
    expect(layoutSheet(gift, custom(50, 50))).toEqual([])
  })
  it('packs from the top-left of the margin', () => {
    const out = layoutSheet(gift, DEFAULT_SHEET)
    expect(Math.min(...out.map((p) => p.x))).toBeCloseTo(6.35)
    expect(Math.min(...out.map((p) => p.y))).toBeCloseTo(6.35)
  })
  it('keeps the first N in reading order', () => {
    const out = layoutSheet(gift, { ...DEFAULT_SHEET, count: 4 })
    expect(out).toHaveLength(4)
    expect(out.every((p) => Math.abs(p.y - 6.35) < 1e-6)).toBe(true)
    expect(out.map((p) => p.x)).toEqual([...out.map((p) => p.x)].sort((a, b) => a - b))
  })
  it('a count above the max gives the max', () => {
    expect(layoutSheet(gift, { ...DEFAULT_SHEET, count: 999 })).toHaveLength(15)
  })
  it('every preset stays inside the margin with at least one gap between tags', () => {
    for (const size of ['letter', 'a4'] as const) {
      const sheet = { ...DEFAULT_SHEET, size }
      const { width, height } = sheetDimensions(sheet)
      for (const d of PRESETS) {
        const boxes = layoutSheet(d, sheet).map((p) => footprint(d, p))
        expect(boxes.length).toBeGreaterThan(0)
        for (const b of boxes) {
          expect(b.x0).toBeGreaterThanOrEqual(sheet.margin - 1e-6)
          expect(b.y0).toBeGreaterThanOrEqual(sheet.margin - 1e-6)
          expect(b.x1).toBeLessThanOrEqual(width - sheet.margin + 1e-6)
          expect(b.y1).toBeLessThanOrEqual(height - sheet.margin + 1e-6)
        }
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]
            const b = boxes[j]
            const apart = Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1)
            expect(apart).toBeGreaterThanOrEqual(sheet.gap - 1e-6)
          }
      }
    }
  })
})
