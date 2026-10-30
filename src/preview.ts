import { contourBounds, type Contour } from './contour'
import type { Design, Hole } from './design'
import { holeCenter, holeWallOk } from './hole'
import { buildOutline, holeAxisOf } from './shapes'
import { tagPathData } from './svg'
import { formatLength, type Unit } from './units'
import type { AppState } from './panel'

export interface PreviewActions {
  setHole(h: Hole, final: boolean): void
  setPoints(c: Contour, final: boolean): void
}

const NS = 'http://www.w3.org/2000/svg'
const MIN_DIAMETER = 1
const MAX_DIAMETER = 25.4

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  if (text !== undefined) e.textContent = text
  return e
}

interface Live {
  state: AppState
  actions: PreviewActions
}
const live = new WeakMap<HTMLElement, Live>()

type Drag =
  | { mode: 'move'; pointerId: number; grab: number }
  | { mode: 'resize'; pointerId: number }
const drags = new WeakMap<HTMLElement, Drag>()

/** Pointer position in design (mm) coordinates, using the current svg's transform. */
function toDesign(root: HTMLElement, e: PointerEvent): { x: number; y: number } | null {
  const svg = root.querySelector('svg')
  const m = svg?.getScreenCTM()
  if (!svg || !m) return null
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
  return { x: p.x, y: p.y }
}

function holeFrom(d: Design, drag: Drag, p: { x: number; y: number }, grab: number): Hole {
  const horizontal = holeAxisOf(d.shape.kind) === 'horizontal'
  if (drag.mode === 'move') {
    const axisLen = horizontal ? d.width : d.height
    const along = (horizontal ? p.x : p.y) - grab
    return { diameter: d.hole.diameter, offset: Math.min(axisLen, Math.max(0, along)) }
  }
  const c = holeCenter(d)
  const diameter = 2 * Math.hypot(p.x - c.x, p.y - c.y)
  return { diameter: Math.min(MAX_DIAMETER, Math.max(MIN_DIAMETER, diameter)), offset: d.hole.offset }
}

function attach(root: HTMLElement) {
  root.addEventListener('pointerdown', (e) => {
    const cur = live.get(root)
    const target = (e.target as Element).closest?.('[data-drag]')
    if (!cur || !target || e.button !== 0) return
    const p = toDesign(root, e)
    if (!p) return
    const d = cur.state.design
    const mode = target.getAttribute('data-drag') === 'resize' ? 'resize' : 'move'
    const horizontal = holeAxisOf(d.shape.kind) === 'horizontal'
    const grab = mode === 'move' ? (horizontal ? p.x : p.y) - d.hole.offset : 0
    drags.set(root, { mode, pointerId: e.pointerId, grab } as Drag)
    // Capture on the persistent container: the svg inside is rebuilt on every move.
    root.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  root.addEventListener('pointermove', (e) => {
    const cur = live.get(root)
    const drag = drags.get(root)
    if (!cur || !drag || drag.pointerId !== e.pointerId) return
    const p = toDesign(root, e)
    if (p) cur.actions.setHole(holeFrom(cur.state.design, drag, p, drag.mode === 'move' ? drag.grab : 0), false)
  })
  const end = (e: PointerEvent) => {
    const cur = live.get(root)
    const drag = drags.get(root)
    if (!cur || !drag || drag.pointerId !== e.pointerId) return
    drags.delete(root)
    if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId)
    // A cancelled gesture still commits the last shown hole so state and preview agree.
    cur.actions.setHole(cur.state.design.hole, true)
  }
  root.addEventListener('pointerup', end)
  root.addEventListener('pointercancel', end)
}

export function renderPreview(root: HTMLElement, state: AppState, actions: PreviewActions): void {
  live.set(root, { state, actions })
  if (!root.dataset.bound) {
    root.dataset.bound = '1'
    attach(root)
  }
  const d = state.design
  const unit: Unit = state.unit
  const b = contourBounds(buildOutline(d))
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const padX = w * 0.1
  const padY = h * 0.1
  const big = Math.max(w, h)
  const font = big * 0.045
  const svg = el('svg', {
    viewBox: `${b.minX - padX} ${b.minY - padY} ${w + 2 * padX} ${h + 2 * padY}`,
    role: 'img',
    'aria-label': `${d.name} tag preview`,
  })
  svg.append(el('path', { class: 'tag', d: tagPathData(d), 'fill-rule': 'evenodd' }))

  // Dimension labels.
  const midX = (b.minX + b.maxX) / 2
  const midY = (b.minY + b.maxY) / 2
  svg.append(
    el('text', { class: 'dim', x: midX, y: b.maxY + padY * 0.65, 'text-anchor': 'middle', 'font-size': font }, formatLength(d.width, unit)),
  )
  const lx = b.minX - padX * 0.4
  svg.append(
    el(
      'text',
      { class: 'dim', x: lx, y: midY, 'text-anchor': 'middle', 'font-size': font, transform: `rotate(-90 ${lx} ${midY})` },
      formatLength(d.height, unit),
    ),
  )

  // Hole: highlighted outline plus a generous invisible hit area, and a resize dot.
  const c = holeCenter(d)
  const r = d.hole.diameter / 2
  const ok = holeWallOk(d)
  svg.append(
    el('circle', { class: ok ? 'hole' : 'hole warn', cx: c.x, cy: c.y, r }),
    el('circle', { class: 'hit', 'data-drag': 'move', cx: c.x, cy: c.y, r: Math.max(r, big * 0.03) }),
  )
  const horizontal = holeAxisOf(d.shape.kind) === 'horizontal'
  const dot = horizontal ? { x: c.x + r, y: c.y } : { x: c.x, y: c.y + r }
  svg.append(el('circle', { class: ok ? 'handle' : 'handle warn', 'data-drag': 'resize', cx: dot.x, cy: dot.y, r: big * 0.016 }))

  root.replaceChildren(svg)
}
