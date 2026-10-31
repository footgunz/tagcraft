import { describe, expect, it } from 'vitest'
import { DEFAULT_FONT, fitTextBox, MIN_WALL_MM, normalizeDesign, PRESETS, wrapAngle, type Design } from '../src/design'
import { loadFont } from '../src/fontlist'
import { holeCenter } from '../src/hole'
import { draggedBox, snapAngle } from '../src/preview'
import { DEFAULT_SHEET, layoutSheet } from '../src/sheet'
import { designToSvg, sheetToSvg } from '../src/svg'
import { boxCenter, defaultText, freeArea, HOLE_TEXT_GAP, rotateAbout, textBoxOverlapsHole, textPaths } from '../src/text'

const gift = PRESETS[0]
const hexagon = PRESETS.find((p) => p.name === 'Hexagon')!
const withText = (d: Design): Design => ({ ...d, text: defaultText(d) })

describe('text settings', () => {
  it('presets and older saved designs have no text', () => {
    expect(PRESETS.every((p) => p.text === null)).toBe(true)
    const { text, ...old } = gift
    expect(text).toBeNull()
    expect(normalizeDesign(old).text).toBeNull()
  })
  it('repairs text and keeps the box inside the tag', () => {
    const t = normalizeDesign({ ...gift, text: { content: 7, font: '', size: 999, lineSpacing: 0, align: 'up', box: { x: -5, y: 100, w: 500, h: 1 } } }).text!
    expect(t).toMatchObject({ content: 'Happy Birthday!', font: DEFAULT_FONT, size: 50.8, lineSpacing: 0.5, align: 'center' })
    expect(t.box).toEqual({ x: 0, y: gift.height - 3, w: gift.width, h: 3 })
  })
})

describe('defaultText', () => {
  it('puts the box beside the hole on a horizontal tag', () => {
    const box = freeArea(gift)
    const c = holeCenter(gift)
    expect(box.x).toBeCloseTo(c.x + gift.hole.diameter / 2 + MIN_WALL_MM)
    expect(box.x + box.w).toBeCloseTo(gift.width - MIN_WALL_MM)
    expect(textBoxOverlapsHole(withText(gift))).toBe(false)
  })
  it('puts the box below the hole on a polygon', () => {
    const box = freeArea(hexagon)
    const c = holeCenter(hexagon)
    expect(box.y).toBeCloseTo(c.y + hexagon.hole.diameter / 2 + MIN_WALL_MM)
    expect(textBoxOverlapsHole(withText(hexagon))).toBe(false)
  })
  it('notices a box that reaches into the hole', () => {
    const d = withText(gift)
    expect(textBoxOverlapsHole({ ...d, text: { ...d.text!, box: { x: 0, y: 0, w: 20, h: 38 } } })).toBe(true)
  })
})

describe('textPaths', () => {
  it('draws the text inside its box once the font has loaded', async () => {
    await loadFont(DEFAULT_FONT)
    const d = withText(gift)
    const paths = textPaths(d)
    expect(paths.length).toBeGreaterThan(5)
    const { x, y, w, h } = d.text!.box
    for (const p of paths) for (const q of [p.start, ...p.segs.map((s) => s.to)]) {
      expect(q.x).toBeGreaterThanOrEqual(x - 1e-6)
      expect(q.x).toBeLessThanOrEqual(x + w + 1e-6)
      expect(q.y).toBeGreaterThanOrEqual(y - 1e-6)
      expect(q.y).toBeLessThanOrEqual(y + h + 1e-6)
    }
  })
  it('is empty for blank text', async () => {
    await loadFont(DEFAULT_FONT)
    const d = withText(gift)
    expect(textPaths({ ...d, text: { ...d.text!, content: '  \n ' } })).toEqual([])
  })
})

describe('text export', () => {
  it('adds a stroked Text layer between Tag and Border, without the box', async () => {
    await loadFont(DEFAULT_FONT)
    const d = { ...withText(gift), border: { inset: 3.175, style: 'solid' as const, weight: 1 as const } }
    const svg = designToSvg(d, 'in')
    const tag = svg.indexOf('inkscape:label="Tag"')
    const text = svg.indexOf('inkscape:label="Text"')
    const border = svg.indexOf('inkscape:label="Border"')
    expect(tag).toBeLessThan(text)
    expect(text).toBeLessThan(border)
    expect(svg).toMatch(/<path id="text" d="M[^"]+" fill="none" stroke="#1f6feb"/)
    expect(svg).not.toMatch(/textbox|<rect/)
    expect(designToSvg(gift, 'in')).not.toContain('Text')
  })
  it('puts every tag on a sheet in the Text layer', async () => {
    await loadFont(DEFAULT_FONT)
    const d = withText(gift)
    const svg = sheetToSvg(d, DEFAULT_SHEET, 'in')
    expect(svg.match(/<path id="text-\d+"/g)).toHaveLength(layoutSheet(d, DEFAULT_SHEET).length)
  })
})

describe('draggedBox', () => {
  const from = { x: 20, y: 5, w: 40, h: 20 }
  it('moves the whole box, staying inside the tag', () => {
    expect(draggedBox(gift, from, '', 5, 3)).toEqual({ x: 25, y: 8, w: 40, h: 20 })
    expect(draggedBox(gift, from, '', -100, 100)).toEqual({ x: 0, y: gift.height - 20, w: 40, h: 20 })
  })
  it('resizes by the dragged sides, no smaller than the minimum and inside the tag', () => {
    expect(draggedBox(gift, from, 'se', 5, -4)).toEqual({ x: 20, y: 5, w: 45, h: 16 })
    expect(draggedBox(gift, from, 'nw', 4, 2)).toEqual({ x: 24, y: 7, w: 36, h: 18 })
    expect(draggedBox(gift, from, 'e', -100, 0).w).toBeCloseTo(3)
    expect(draggedBox(gift, from, 'n', 0, -100).y).toBe(0)
    expect(draggedBox(gift, from, 'e', 100, 0).w).toBeCloseTo(gift.width - 20)
  })
})

describe('text rotation', () => {
  const corners = (b: { x: number; y: number; w: number; h: number }, deg: number) => {
    const turn = rotateAbout(boxCenter(b), deg)
    return [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h },
      { x: b.x, y: b.y + b.h },
    ].map(turn)
  }
  const onTag = (d: Design, b: { x: number; y: number; w: number; h: number }, deg: number) =>
    corners(b, deg).every((p) => p.x >= -1e-6 && p.x <= d.width + 1e-6 && p.y >= -1e-6 && p.y <= d.height + 1e-6)

  it('wraps angles to -180 < a <= 180', () => {
    expect([0, 90, 180, -180, 190, 360, -270, 725].map(wrapAngle)).toEqual([0, 90, 180, 180, -170, 0, 90, 5])
  })
  it('keeps a turned box on the tag, shrinking it when it would not fit', () => {
    const t = normalizeDesign({ ...withText(gift), text: { ...defaultText(gift), rotation: -20 } }).text!
    expect(t.rotation).toBe(-20)
    expect(onTag(gift, t.box, -20)).toBe(true)
    // Turned, the default box (57.8 × 31.75 mm) is taller than the 38.1 mm tag, so it shrinks in proportion.
    expect(t.box.w / t.box.h).toBeCloseTo(defaultText(gift).box.w / defaultText(gift).box.h, 6)
    expect(t.box.w).toBeLessThan(defaultText(gift).box.w)
  })
  it('only moves a turned box that fits, without shrinking it', () => {
    const b = fitTextBox({ x: 60, y: 0, w: 20, h: 10 }, 30, gift.width, gift.height)
    expect(b.w).toBe(20)
    expect(b.h).toBe(10)
    expect(onTag(gift, b, 30)).toBe(true)
  })
  it('turns the text with its box', async () => {
    await loadFont(DEFAULT_FONT)
    const d = normalizeDesign({ ...withText(gift), text: { ...defaultText(gift), content: 'Hello there, friend', rotation: 35 } })
    const t = d.text!
    const back = rotateAbout(boxCenter(t.box), -t.rotation)
    for (const p of textPaths(d)) for (const q of [p.start, ...p.segs.map((s) => s.to)].map(back)) {
      expect(q.x).toBeGreaterThanOrEqual(t.box.x - 1e-6)
      expect(q.x).toBeLessThanOrEqual(t.box.x + t.box.w + 1e-6)
      expect(q.y).toBeGreaterThanOrEqual(t.box.y - 1e-6)
      expect(q.y).toBeLessThanOrEqual(t.box.y + t.box.h + 1e-6)
    }
  })
  it('checks the hole against the turned box', () => {
    const text = { ...defaultText(gift), box: { x: 14, y: 14, w: 30, h: 10 }, rotation: 0 }
    expect(textBoxOverlapsHole({ ...gift, text })).toBe(false)
    // Turned 90° about its centre (29, 19), the box spans x 24..34: still clear of the hole at x ≈ 9.
    expect(textBoxOverlapsHole({ ...gift, text: { ...text, rotation: 90 } })).toBe(false)
    // A longer box turned slightly reaches back over the hole.
    expect(textBoxOverlapsHole({ ...gift, text: { ...text, box: { x: 2, y: 14, w: 60, h: 10 }, rotation: 5 } })).toBe(true)
  })
  it('resizes a turned box along its own sides', () => {
    // Turned 90°, the box's right side faces down: dragging it down 5 mm makes it 5 mm longer,
    // with its centre moving down 2.5 mm.
    const from = { x: 20, y: 10, w: 20, h: 10 }
    const b = draggedBox(gift, from, 'e', 0, 5, 90)
    expect(b.w).toBeCloseTo(25, 6)
    expect(b.h).toBeCloseTo(10, 6)
    expect(boxCenter(b).x).toBeCloseTo(30, 6)
    expect(boxCenter(b).y).toBeCloseTo(17.5, 6)
    // Moving a turned box drags its centre.
    const m = draggedBox(gift, from, '', 4, 1, 90)
    expect(boxCenter(m)).toEqual({ x: 34, y: 16 })
  })
  it('snaps turns to 45° when close, and to 15° steps with Shift', () => {
    expect(snapAngle(44, false)).toBe(45)
    expect(snapAngle(40, false)).toBe(40)
    expect(snapAngle(37, true)).toBe(30)
    expect(snapAngle(-179, false)).toBe(180)
    expect(snapAngle(12.345, false)).toBe(12.3)
  })
})

describe('text and the hole', () => {
  it('leaves out text over the hole, with a gap, and keeps the rest', async () => {
    await loadFont(DEFAULT_FONT)
    // A wide box across the whole tag, through the hole.
    const d = normalizeDesign({ ...gift, text: { ...defaultText(gift), content: 'MMMMMMMMMMMMMMMMMMMMMMMMMMMM', size: 10, box: { x: 0, y: 10, w: gift.width, h: 15 } } })
    expect(textBoxOverlapsHole(d)).toBe(true)
    const c = holeCenter(d)
    const clear = d.hole.diameter / 2 + HOLE_TEXT_GAP
    const paths = textPaths(d)
    // The over-wide word is cut at the box edge to about nine M strokes; the one over the hole goes.
    expect(paths.length).toBeGreaterThan(4)
    for (const p of paths) {
      let from = p.start
      for (const s of p.segs) {
        for (let i = 0; i <= 10; i++) {
          const t = i / 10
          const u = 1 - t
          const q =
            s.kind === 'L'
              ? { x: from.x + (s.to.x - from.x) * t, y: from.y + (s.to.y - from.y) * t }
              : {
                  x: u * u * u * from.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.to.x,
                  y: u * u * u * from.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.to.y,
                }
          expect(Math.hypot(q.x - c.x, q.y - c.y)).toBeGreaterThanOrEqual(clear - 1e-6)
        }
        from = s.to
      }
    }
    // Text on both sides of the hole is still there.
    const xs = paths.flatMap((p) => [p.start, ...p.segs.map((s) => s.to)]).map((q) => q.x)
    expect(Math.min(...xs)).toBeLessThan(c.x)
    expect(Math.max(...xs)).toBeGreaterThan(c.x + 20)
  })
})
