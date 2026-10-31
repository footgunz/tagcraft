import type { Pt } from './contour'
import { DEFAULT_FONT, DEFAULT_TEXT, MIN_TEXT_BOX, MIN_WALL_MM, type Design, type TextBox, type TextSettings } from './design'
import type { Font } from './fonts'
import { loadedFont } from './fontlist'
import { holeCenter } from './hole'
import { holeAxisOf } from './shapes'
import { clipOutsideCircle, layoutText, type TextPath } from './textlayout'

/** Space kept between text and the hole's edge (mm), so the pen never draws into the hole. */
export const HOLE_TEXT_GAP = 1

/** The tag's free area beside (or below) the hole, inset by the minimum wall. */
export function freeArea(d: Design): TextBox {
  const c = holeCenter(d)
  const clear = d.hole.diameter / 2 + MIN_WALL_MM
  const m = MIN_WALL_MM
  const box =
    holeAxisOf(d.shape.kind) === 'horizontal'
      ? { x: c.x + clear, y: m, w: d.width - m - (c.x + clear), h: d.height - 2 * m }
      : { x: m, y: c.y + clear, w: d.width - 2 * m, h: d.height - m - (c.y + clear) }
  if (box.w >= MIN_TEXT_BOX && box.h >= MIN_TEXT_BOX) return box
  // Too little room beside the hole: use the whole tag, inset.
  return { x: m, y: m, w: Math.max(MIN_TEXT_BOX, d.width - 2 * m), h: Math.max(MIN_TEXT_BOX, d.height - 2 * m) }
}

/** A new text layer: default text, centred in the tag's free area, sized to fit it. */
export function defaultText(d: Design): TextSettings {
  const box = freeArea(d)
  return { content: DEFAULT_TEXT, font: DEFAULT_FONT, size: Math.min(5, box.h * 0.4), lineSpacing: 1, align: 'center', box, rotation: 0 }
}

// Layouts are cached per loaded font, so an uploaded font that replaces one of the same name lays out afresh.
const cache = new WeakMap<Font, Map<string, TextPath[]>>()

/** The text's strokes in tag mm, clipped to its box and kept out of the hole; empty without text or while its font loads. */
export function textPaths(d: Design): TextPath[] {
  const t = d.text
  const font = t && loadedFont(t.font)
  if (!t || !font || !t.content.trim()) return []
  let byText = cache.get(font)
  if (!byText) cache.set(font, (byText = new Map()))
  const hole = holeCenter(d)
  const clear = d.hole.diameter / 2 + HOLE_TEXT_GAP
  const key = JSON.stringify([t, hole, clear])
  let out = byText.get(key)
  if (!out) {
    // Laid out and clipped in the box's own frame, then turned with the box.
    out = layoutText(font, t.content, t, t.box)
    if (t.rotation) out = mapTextPaths(out, rotateAbout(boxCenter(t.box), t.rotation))
    // Text over the hole is cut away, with a small gap, so the pen doesn't draw into the hole.
    out = clipOutsideCircle(out, hole, clear)
    if (byText.size > 16) byText.clear()
    byText.set(key, out)
  }
  return out
}

/** Move every point of text strokes, e.g. into a tag's slot on a sheet. */
export function mapTextPaths(paths: TextPath[], f: (p: Pt) => Pt): TextPath[] {
  return paths.map((p) => ({
    start: f(p.start),
    closed: p.closed,
    segs: p.segs.map((s) => (s.kind === 'L' ? { kind: 'L', to: f(s.to) } : { kind: 'C', c1: f(s.c1), c2: f(s.c2), to: f(s.to) })),
  }))
}

export const boxCenter = (b: TextBox): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/** Turn points by `deg` clockwise (on screen, y down) about `c`. */
export function rotateAbout(c: Pt, deg: number): (p: Pt) => Pt {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return (p) => ({ x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos })
}

/** True when the text box reaches into the hole. */
export function textBoxOverlapsHole(d: Design): boolean {
  if (!d.text) return false
  const { x, y, w, h } = d.text.box
  // Work in the box's own frame: turn the hole's centre back by the box's rotation.
  const c = rotateAbout(boxCenter(d.text.box), -d.text.rotation)(holeCenter(d))
  const nx = Math.min(Math.max(c.x, x), x + w)
  const ny = Math.min(Math.max(c.y, y), y + h)
  return Math.hypot(c.x - nx, c.y - ny) < d.hole.diameter / 2
}
