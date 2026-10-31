import { Font as OpentypeFont, Glyph as OpentypeGlyph, Path as OpentypePath } from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FONT, addFont, fontEntries, licenseFor, loadFont, resolveFont } from '../src/fontlist'
import { parsePathData, parseSvgFont, type GlyphPath } from '../src/fonts'

const ends = (paths: GlyphPath[]) => paths.map((p) => [p.start, ...p.segs.map((s) => s.to)].map((q) => [q.x, q.y]))

describe('parsePathData', () => {
  it('reads absolute lines and moves, with repeated pairs as lines', () => {
    expect(ends(parsePathData('M0 0 L10 0 10 10 M20 0 L30 0'))).toEqual([
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      [
        [20, 0],
        [30, 0],
      ],
    ])
  })
  it('reads relative commands, H and V, and compact numbers', () => {
    // As Relief SingleLine writes them.
    expect(ends(parsePathData('M155 213h367M606 0l-264 675h-4l-268-675'))).toEqual([
      [
        [155, 213],
        [522, 213],
      ],
      [
        [606, 0],
        [342, 675],
        [338, 675],
        [70, 0],
      ],
    ])
    expect(ends(parsePathData('m1 1v4H0V.5'))).toEqual([
      [
        [1, 1],
        [1, 5],
        [0, 5],
        [0, 0.5],
      ],
    ])
  })
  it('reflects the control point for smooth curves', () => {
    const [p] = parsePathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0')
    const s = p.segs[1]
    expect(s.kind).toBe('C')
    if (s.kind === 'C') expect(s.c1).toEqual({ x: 10, y: -10 })
  })
  it('raises quadratics to cubics', () => {
    const [p] = parsePathData('M0 0 Q15 30 30 0 T60 0')
    const [q, t] = p.segs
    if (q.kind !== 'C' || t.kind !== 'C') throw new Error('expected cubics')
    expect(q.c1).toEqual({ x: 10, y: 20 })
    expect(q.c2).toEqual({ x: 20, y: 20 })
    // T reflects the quadratic control point (15, 30) through (30, 0) to (45, -30).
    expect(t.c1).toEqual({ x: 40, y: -20 })
  })
  it('closes contours, adding the closing line when needed', () => {
    const [p] = parsePathData('M0 0 L10 0 L10 10 Z')
    expect(p.closed).toBe(true)
    expect(p.segs.at(-1)!.to).toEqual({ x: 0, y: 0 })
  })
})

const tiny = `<svg><defs><font id="t" horiz-adv-x="500">
<font-face units-per-em="1000" ascent="800" descent="-200"
  cap-height="700" />
<missing-glyph horiz-adv-x="300" />
<glyph glyph-name="A" unicode="A" horiz-adv-x="600" d="M0 0 L300 700 L600 0" />
<glyph glyph-name="V" unicode="V" d="M0 700 L250 0 L500 700" />
<glyph glyph-name="amp" unicode="&amp;" d="M0 0 L10 10" />
<glyph glyph-name="eacute" unicode="&#xe9;" d="M0 0 L10 10" />
<glyph unicode="fi" d="M0 0 L1 1" />
<glyph glyph-name="space" unicode=" " horiz-adv-x="250" />
<hkern g1="A" g2="V" k="80" />
<hkern u1="V,A" u2="A" k="20" />
</font></defs></svg>`

describe('parseSvgFont', () => {
  const f = parseSvgFont(tiny, 'Tiny')
  it('reads the metrics', () => {
    expect(f).toMatchObject({ name: 'Tiny', singleLine: true, unitsPerEm: 1000, ascent: 800, descent: -200, capHeight: 700, missingAdvance: 300 })
  })
  it('looks up glyphs, with the font default advance', () => {
    expect(f.glyph('A')!.advance).toBe(600)
    expect(f.glyph('V')!.advance).toBe(500)
    expect(f.glyph('A')!.paths).toHaveLength(1)
    expect(f.glyph(' ')!.paths).toEqual([])
  })
  it('decodes entities and skips ligatures', () => {
    expect(f.glyph('&')).not.toBeNull()
    expect(f.glyph('é')).not.toBeNull()
    expect(f.glyph('f')).toBeNull()
    expect(f.glyph('Z')).toBeNull()
  })
  it('kerns by glyph name and by character list', () => {
    expect(f.kerning('A', 'V')).toBe(-80)
    expect(f.kerning('V', 'A')).toBe(-20)
    expect(f.kerning('A', 'A')).toBe(-20)
    expect(f.kerning('V', 'V')).toBe(0)
  })
})

describe('bundled fonts', () => {
  it('lists single-line fonts, the default first among them alphabetically', () => {
    const list = fontEntries()
    expect(list.length).toBeGreaterThanOrEqual(6)
    expect(list.every((e) => e.group === 'bundled' && e.singleLine)).toBe(true)
    expect(list.map((e) => e.name)).toContain(DEFAULT_FONT)
  })
  it('ships every bundled font with its license', () => {
    for (const e of fontEntries()) expect(licenseFor(e.name)).toMatch(/Open Font License|Hershey/)
  })
  it('loads every bundled font with open strokes for common letters', async () => {
    for (const e of fontEntries()) {
      const font = await loadFont(e.name)
      expect(font.capHeight).toBeGreaterThan(0)
      for (const ch of 'AaZz09') {
        const g = font.glyph(ch)
        expect(g, `${e.name} ${ch}`).not.toBeNull()
        expect(g!.paths.length).toBeGreaterThan(0)
        expect(g!.advance).toBeGreaterThan(0)
      }
      // Single-line fonts: the letter I is strokes, not a closed outline.
      expect(font.glyph('I')!.paths.some((p) => !p.closed)).toBe(true)
    }
  })
  it('falls back to the default font for a name it does not have', async () => {
    expect(resolveFont('Nonexistent')).toEqual({ name: DEFAULT_FONT, fellBack: true })
    expect(resolveFont(DEFAULT_FONT)).toEqual({ name: DEFAULT_FONT, fellBack: false })
    expect((await loadFont('Nonexistent')).name).toBe(DEFAULT_FONT)
  })
})

describe('added fonts', () => {
  it('adds an SVG single-line font for the session', async () => {
    const entry = addFont('My Hand.svg', new TextEncoder().encode(tiny).buffer as ArrayBuffer)
    expect(entry).toEqual({ name: 'My Hand', group: 'added', singleLine: true })
    expect(fontEntries().at(-1)!.name).toBe('My Hand')
    expect((await loadFont('My Hand')).glyph('A')!.advance).toBe(600)
  })
  it('adds a TTF as an outline font, with closed contours and kerning', async () => {
    const box = new OpentypePath()
    box.moveTo(100, 0)
    box.lineTo(100, 700)
    box.quadraticCurveTo(300, 900, 500, 700)
    box.lineTo(500, 0)
    box.close()
    const glyphs = [
      new OpentypeGlyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new OpentypePath() }),
      new OpentypeGlyph({ name: 'A', unicode: 65, advanceWidth: 600, path: box }),
    ]
    const ttf = new OpentypeFont({ familyName: 'Boxy', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs })
    const entry = addFont('Boxy.otf', ttf.toArrayBuffer())
    expect(entry).toMatchObject({ name: 'Boxy', group: 'added', singleLine: false })
    const font = await loadFont('Boxy')
    const g = font.glyph('A')!
    expect(g.advance).toBe(600)
    expect(g.paths).toHaveLength(1)
    expect(g.paths[0].closed).toBe(true)
    // The quadratic is kept as a curve.
    expect(g.paths[0].segs.some((s) => s.kind === 'C')).toBe(true)
    expect(font.glyph('Z')).toBeNull()
  })
  it('rejects a file that is not a font', () => {
    expect(() => addFont('notes.ttf', new TextEncoder().encode('hello').buffer as ArrayBuffer)).toThrow()
  })
})
