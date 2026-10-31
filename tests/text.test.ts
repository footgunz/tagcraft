import { describe, expect, it } from 'vitest'
import { DEFAULT_FONT, MIN_WALL_MM, normalizeDesign, PRESETS, type Design } from '../src/design'
import { loadFont } from '../src/fontlist'
import { holeCenter } from '../src/hole'
import { draggedBox } from '../src/preview'
import { DEFAULT_SHEET, layoutSheet } from '../src/sheet'
import { designToSvg, sheetToSvg } from '../src/svg'
import { defaultText, freeArea, textBoxOverlapsHole, textPaths } from '../src/text'

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
