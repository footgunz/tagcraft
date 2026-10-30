import { describe, expect, it } from 'vitest'
import { PRESETS } from '../src/design'
import { DEFAULT_SHEET, layoutSheet, type Placement } from '../src/sheet'
import { designToSvg, sheetSvgFilename, sheetToSvg, svgFilename, tagPathData } from '../src/svg'

describe('svg export', () => {
  const svg = designToSvg(PRESETS[0], 'in')

  it('true size in inches with mm viewBox', () => {
    expect(svg).toContain('width="3in"')
    expect(svg).toContain('height="1.5in"')
    expect(svg).toContain('viewBox="0 0 76.2 38.1"')
  })
  it('mm units', () => expect(designToSvg(PRESETS[0], 'mm')).toContain('width="76.2mm"'))
  it('one evenodd path with two subpaths and real curves', () => {
    expect(svg.match(/<path /g)).toHaveLength(1)
    expect(svg).toContain('fill-rule="evenodd"')
    expect(tagPathData(PRESETS[0]).match(/M/g)).toHaveLength(2)
    expect(tagPathData(PRESETS[0])).toContain('C')
  })
  it('is an inkscape layer named Tag', () =>
    expect(svg).toMatch(/inkscape:groupmode="layer" inkscape:label="Tag"/))
  it('is well-formed: balanced tags, quoted attributes', () => expectWellFormed(svg))
  it('filename', () => {
    expect(svgFilename(PRESETS[0])).toBe('tagcraft-gift-tag.svg')
    expect(svgFilename({ ...PRESETS[0], name: '  ' })).toBe('tagcraft-rectangle.svg')
  })
})

describe('sheet svg export', () => {
  const gift = PRESETS[0]
  const svg = sheetToSvg(gift, DEFAULT_SHEET, 'in')
  const paths = [...svg.matchAll(/<path id="([^"]+)" d="([^"]+)"/g)].map((m) => ({ id: m[1], d: m[2] }))

  function bounds(d: string) {
    const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
    const xs = n.filter((_, i) => i % 2 === 0)
    const ys = n.filter((_, i) => i % 2 === 1)
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  }
  function slot(p: Placement) {
    const [w, h] = p.rotation === 90 ? [gift.height, gift.width] : [gift.width, gift.height]
    return { x0: p.x, y0: p.y, x1: p.x + w, y1: p.y + h }
  }

  it('is the sheet at true size with an mm viewBox', () => {
    expect(svg).toContain('width="8.5in"')
    expect(svg).toContain('height="11in"')
    expect(svg).toContain('viewBox="0 0 215.9 279.4"')
    expect(sheetToSvg(gift, { ...DEFAULT_SHEET, size: 'a4' }, 'mm')).toContain('width="210mm" height="297mm"')
  })
  it('one evenodd path per tag, each with its hole and real curves', () => {
    expect(paths).toHaveLength(15)
    expect(new Set(paths.map((p) => p.id)).size).toBe(15)
    for (const p of paths) {
      expect(p.d.match(/M/g)).toHaveLength(2)
      expect(p.d).toContain('C')
    }
    expect(svg.match(/fill-rule="evenodd"/g)).toHaveLength(15)
  })
  it('writes positions into the coordinates, with no transforms', () => expect(svg).not.toContain('transform'))
  it('each tag lands in its slot, turned tags included', () => {
    const placements = layoutSheet(gift, DEFAULT_SHEET)
    expect(placements.some((p) => p.rotation === 90)).toBe(true)
    placements.forEach((pl, i) => {
      const b = bounds(paths[i].d)
      const s = slot(pl)
      expect(b.x0).toBeGreaterThanOrEqual(s.x0 - 0.01)
      expect(b.y0).toBeGreaterThanOrEqual(s.y0 - 0.01)
      expect(b.x1).toBeLessThanOrEqual(s.x1 + 0.01)
      expect(b.y1).toBeLessThanOrEqual(s.y1 + 0.01)
      // The outline fills its slot, so a turned tag really is turned.
      expect(b.x1 - b.x0).toBeCloseTo(s.x1 - s.x0, 1)
      expect(b.y1 - b.y0).toBeCloseTo(s.y1 - s.y0, 1)
    })
  })
  it('an upright copy matches the single-tag export, shifted', () => {
    const upright = sheetToSvg(gift, { ...DEFAULT_SHEET, size: 'custom', customWidth: 76.2, customHeight: 38.1, margin: 0 }, 'mm')
    expect(upright).toContain(`d="${tagPathData(gift)}"`)
  })
  it('is well-formed, and still a valid sheet when nothing fits', () => {
    expectWellFormed(svg)
    const empty = sheetToSvg(gift, { ...DEFAULT_SHEET, size: 'custom', customWidth: 50, customHeight: 50 }, 'in')
    expectWellFormed(empty)
    expect(empty).not.toContain('<path')
  })
  it('filename names the sheet and the count', () => {
    expect(sheetSvgFilename(gift, DEFAULT_SHEET)).toBe('tagcraft-gift-tag-letter-15up.svg')
    expect(sheetSvgFilename(gift, { ...DEFAULT_SHEET, size: 'custom', count: 6 })).toBe('tagcraft-gift-tag-custom-6up.svg')
  })
})

function expectWellFormed(svg: string) {
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg.trim().endsWith('</svg>')).toBe(true)
  const stack: string[] = []
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^<>]*?(\/?)>/g)) {
    if (m[3]) continue
    if (m[1]) expect(stack.pop()).toBe(m[2])
    else stack.push(m[2])
  }
  expect(stack).toEqual([])
  expect(svg.replace(/"[^"]*"/g, '')).not.toMatch(/[&"]/)
}
