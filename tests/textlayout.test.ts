import { describe, expect, it } from 'vitest'
import type { Pt } from '../src/contour'
import { DEFAULT_FONT, fontEntries, loadFont } from '../src/fontlist'
import { parsePathData, type Font } from '../src/fonts'
import { layoutLines, layoutText, textPathData, type TextBox, type TextPath, type TextStyle } from '../src/textlayout'

// A monospaced test font: every glyph 600 units wide, cap height 700, line height 1000.
// At size 7 mm that's 0.01 mm a unit: 6 mm a character, 10 mm a line, first baseline 8 mm down.
const shapes: Record<string, string> = {
  A: 'M300 0 L300 700',
  '-': 'M0 350 L600 350',
  // A circle of radius 300 around (300, 350), as four cubics.
  O: 'M600 350 C600 516 466 650 300 650 C134 650 0 516 0 350 C0 184 134 50 300 50 C466 50 600 184 600 350 Z',
}
const mono: Font = {
  name: 'Mono',
  singleLine: true,
  unitsPerEm: 1000,
  capHeight: 700,
  ascent: 800,
  descent: -200,
  missingAdvance: 600,
  glyph: (ch) => (ch === ' ' ? { advance: 600, paths: [] } : shapes[ch] ? { advance: 600, paths: parsePathData(shapes[ch]) } : null),
  kerning: () => 0,
}
const style: TextStyle = { size: 7, lineSpacing: 1, align: 'left' }
const big: TextBox = { x: 10, y: 20, w: 45, h: 100 }

const ends = (paths: TextPath[]): Pt[] => paths.flatMap((p) => [p.start, ...p.segs.map((s) => s.to)])

function sampled(paths: TextPath[]): Pt[] {
  const out: Pt[] = []
  for (const p of paths) {
    let from = p.start
    for (const s of p.segs) {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10
        const u = 1 - t
        out.push(
          s.kind === 'L'
            ? { x: from.x + (s.to.x - from.x) * t, y: from.y + (s.to.y - from.y) * t }
            : {
                x: u * u * u * from.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.to.x,
                y: u * u * u * from.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.to.y,
              },
        )
      }
      from = s.to
    }
  }
  return out
}

const insideBox = (p: Pt, b: TextBox) => p.x >= b.x - 1e-6 && p.x <= b.x + b.w + 1e-6 && p.y >= b.y - 1e-6 && p.y <= b.y + b.h + 1e-6

describe('layoutLines', () => {
  it('wraps words at the box width', () => {
    // "AAA AAA" is 42 mm: it fits 45 mm but not 40.
    expect(layoutLines(mono, 'AAA AAA AAA', style, big).map((l) => l.text)).toEqual(['AAA AAA', 'AAA'])
    expect(layoutLines(mono, 'AAA AAA AAA', style, { ...big, w: 40 }).map((l) => l.text)).toEqual(['AAA', 'AAA', 'AAA'])
  })
  it('breaks lines at Enter, keeping empty lines', () => {
    expect(layoutLines(mono, 'A\n\nA', style, big).map((l) => l.text)).toEqual(['A', '', 'A'])
  })
  it('keeps a word wider than the box on its own line', () => {
    const lines = layoutLines(mono, 'A AAAAAAAAAA A', style, big)
    expect(lines.map((l) => l.text)).toEqual(['A', 'AAAAAAAAAA', 'A'])
    expect(lines[1].width).toBeCloseTo(60)
  })
  it('starts at the top of the box and steps by the line height', () => {
    const lines = layoutLines(mono, 'A\nA\nA', { ...style, lineSpacing: 1.5 }, big)
    expect(lines.map((l) => l.baseline)).toEqual([28, 43, 58].map((v) => expect.closeTo(v, 9)))
  })
  it('aligns left, center and right', () => {
    const x = (align: TextStyle['align']) => layoutLines(mono, 'AAA', { ...style, align }, big)[0].x
    expect(x('left')).toBeCloseTo(10)
    expect(x('center')).toBeCloseTo(10 + (45 - 18) / 2)
    expect(x('right')).toBeCloseTo(10 + 45 - 18)
  })
})

describe('layoutText', () => {
  it('scales letters to the cap height', async () => {
    const font = await loadFont(DEFAULT_FONT)
    const ys = sampled(layoutText(font, 'H', { ...style, size: 10 }, big)).map((p) => p.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10, 2)
  })
  it('keeps a whole outline contour closed when it fits', () => {
    const [o] = layoutText(mono, 'O', style, big)
    expect(o.closed).toBe(true)
    expect(o.segs.every((s) => s.kind === 'C')).toBe(true)
  })
  it('clips strokes exactly at the bottom edge', () => {
    // "A" runs from the baseline (20 + 8 = 28) up to the cap height (21); the box ends at 26.
    const ys = ends(layoutText(mono, 'A', style, { ...big, h: 6 })).map((p) => p.y)
    expect(Math.max(...ys)).toBeCloseTo(26, 9)
    expect(Math.min(...ys)).toBeCloseTo(21, 9)
  })
  it('clips strokes exactly at the top edge', () => {
    // "|" reaches from 2 mm below the baseline to 10 mm above it, past the font's ascent,
    // so it pokes out of the top of the box (28 - 10 = 18 < 20) as well as the bottom.
    const tall: Font = { ...mono, glyph: (ch) => (ch === '|' ? { advance: 600, paths: parsePathData('M300 -200 L300 1000') } : mono.glyph(ch)) }
    const ys = ends(layoutText(tall, '|', style, { ...big, h: 9 })).map((p) => p.y)
    expect(Math.min(...ys)).toBeCloseTo(20, 9)
    expect(Math.max(...ys)).toBeCloseTo(29, 9)
  })
  it('clips strokes exactly at the left and right edges', () => {
    // "---" spans 10..28 mm; a 13 mm box cuts the middle dash at x = 23.
    const box = { ...big, w: 13 }
    const paths = layoutText(mono, '---', style, box)
    const xs = ends(paths).map((p) => p.x)
    expect(Math.max(...xs)).toBeCloseTo(23, 9)
    expect(paths.every((p) => !p.closed)).toBe(true)
    // Shift the box right so the first dash starts outside its left edge.
    const right = layoutText(mono, '---', { ...style, align: 'right' }, { ...box, x: 10, w: 13 })
    expect(Math.min(...ends(right).map((p) => p.x))).toBeCloseTo(10, 9)
  })
  it('splits a curve where it crosses the edge, keeping it a curve', () => {
    // The O spans 10..16 mm; cut it down the middle at x = 13.
    const box = { ...big, w: 3 }
    const paths = layoutText(mono, 'O', style, box)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.every((p) => !p.closed)).toBe(true)
    expect(paths.flatMap((p) => p.segs).every((s) => s.kind === 'C')).toBe(true)
    for (const p of sampled(paths)) expect(insideBox(p, box)).toBe(true)
    // The cut ends sit on the edge.
    expect(ends(paths).filter((p) => Math.abs(p.x - 13) < 1e-6).length).toBeGreaterThanOrEqual(2)
    // Control points of a split piece stay close to the original circle, not flattened.
    const r = 3
    for (const p of sampled(paths)) expect(Math.abs(Math.hypot(p.x - 13, p.y - (28 - 3.5)) - r)).toBeLessThan(0.02)
  })
  it('clips an over-wide word at the box edge', () => {
    const paths = layoutText(mono, 'AAAAAAAAAA', style, big)
    // Strokes of "A" sit 3 mm into each 6 mm cell: x = 13, 19, ... 67. Only those up to 55 are kept.
    const xs = ends(paths).map((p) => p.x)
    expect(Math.max(...xs)).toBeLessThanOrEqual(55)
    expect(new Set(xs.map((x) => Math.round(x))).size).toBe(8)
  })
  it('never draws outside the box, with any bundled font', async () => {
    const box = { x: 5, y: 5, w: 40, h: 12 }
    for (const e of fontEntries()) {
      const font = await loadFont(e.name)
      const paths = layoutText(font, 'Happy Birthday, Avery! Quite a long line of text to clip', { size: 5, lineSpacing: 1, align: 'center' }, box)
      expect(paths.length).toBeGreaterThan(0)
      for (const p of sampled(paths)) expect(insideBox(p, box), e.name).toBe(true)
    }
  })
})

describe('textPathData', () => {
  it('writes lines and curves, closing whole contours', () => {
    const d = textPathData(layoutText(mono, 'AO', style, big))
    expect(d).toMatch(/^M13 28 L13 21 M/)
    expect(d).toContain('C')
    expect(d.trim().endsWith('Z')).toBe(true)
  })
})
