import { contourBounds, moveNode, type Contour, type Pt } from './contour'
import type { Design, Hole } from './design'
import { holeCenter, holeWallOk } from './hole'
import { buildOutline, holeAxisOf } from './shapes'
import { sheetDimensions } from './sheet'
import { sheetTagPathData, tagPathData } from './svg'
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

/** `start` is the pointer's screen position at pointerdown; `moved` turns on once it leaves it. */
type Drag = { pointerId: number; start: { x: number; y: number }; moved: boolean } & (
  | { mode: 'move'; grab: number }
  | { mode: 'resize' }
  | { mode: 'node'; index: number; part: 'p' | 'hIn' | 'hOut'; dx: number; dy: number }
)
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
    const start = { x: e.clientX, y: e.clientY }
    const kind = target.getAttribute('data-drag')
    if (kind === 'node') {
      if (!cur.state.editing) return
      const index = Number(target.getAttribute('data-index'))
      const part = target.getAttribute('data-part') as 'p' | 'hIn' | 'hOut'
      const at = buildOutline(d)[index]?.[part]
      if (!at) return
      // Remember where inside the dot it was grabbed so the node doesn't jump.
      drags.set(root, { mode: 'node', pointerId: e.pointerId, start, moved: false, index, part, dx: at.x - p.x, dy: at.y - p.y })
      root.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    const mode = kind === 'resize' ? 'resize' : 'move'
    const horizontal = holeAxisOf(d.shape.kind) === 'horizontal'
    const grab = mode === 'move' ? (horizontal ? p.x : p.y) - d.hole.offset : 0
    drags.set(root, { mode, pointerId: e.pointerId, start, moved: false, grab } as Drag)
    // Capture on the persistent container: the svg inside is rebuilt on every move.
    root.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  root.addEventListener('pointermove', (e) => {
    const cur = live.get(root)
    const drag = drags.get(root)
    if (!cur || !drag || drag.pointerId !== e.pointerId) return
    if (!drag.moved && e.clientX === drag.start.x && e.clientY === drag.start.y) return
    drag.moved = true
    const p = toDesign(root, e)
    if (p && drag.mode === 'node') {
      const to: Pt = { x: p.x + drag.dx, y: p.y + drag.dy }
      cur.actions.setPoints(moveNode(buildOutline(cur.state.design), drag.index, drag.part, to), false)
    } else if (p) cur.actions.setHole(holeFrom(cur.state.design, drag, p, drag.mode === 'move' ? drag.grab : 0), false)
  })
  const end = (e: PointerEvent) => {
    const cur = live.get(root)
    const drag = drags.get(root)
    if (!cur || !drag || drag.pointerId !== e.pointerId) return
    drags.delete(root)
    if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId)
    // A click without movement changed nothing: don't commit (and re-fit) anything.
    if (!drag.moved) return
    // A cancelled gesture still commits the last shown state so state and preview agree.
    if (drag.mode === 'node') cur.actions.setPoints(buildOutline(cur.state.design), true)
    else cur.actions.setHole(cur.state.design.hole, true)
  }
  root.addEventListener('pointerup', end)
  root.addEventListener('pointercancel', end)
}

/** Read-only view of the whole sheet: paper, margin, and the tags in place. */
function sheetPreview(state: AppState): SVGSVGElement {
  const { width, height } = sheetDimensions(state.sheet)
  const m = state.sheet.margin
  const big = Math.max(width, height)
  const pad = big * 0.06
  const font = big * 0.022
  const svg = el('svg', {
    viewBox: `${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}`,
    role: 'img',
    'aria-label': `Sheet of ${state.design.name} tags`,
  })
  svg.append(el('rect', { class: 'sheet', x: 0, y: 0, width, height }))
  if (m > 0) svg.append(el('rect', { class: 'margin', x: m, y: m, width: width - 2 * m, height: height - 2 * m }))
  for (const data of sheetTagPathData(state.design, state.sheet)) svg.append(el('path', { class: 'tag', d: data, 'fill-rule': 'evenodd' }))
  svg.append(
    el('text', { class: 'dim', x: width / 2, y: height + pad * 0.65, 'text-anchor': 'middle', 'font-size': font }, formatLength(width, state.unit)),
  )
  const lx = -pad * 0.4
  svg.append(
    el(
      'text',
      { class: 'dim', x: lx, y: height / 2, 'text-anchor': 'middle', 'font-size': font, transform: `rotate(-90 ${lx} ${height / 2})` },
      formatLength(height, state.unit),
    ),
  )
  return svg
}

export function renderPreview(root: HTMLElement, state: AppState, actions: PreviewActions): void {
  live.set(root, { state, actions })
  if (!root.dataset.bound) {
    root.dataset.bound = '1'
    attach(root)
  }
  if (state.view === 'sheet') return root.replaceChildren(sheetPreview(state))
  const d = state.design
  const unit: Unit = state.unit
  const b = contourBounds(buildOutline(d))
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const big = Math.max(w, h)
  // One pad on all four sides, from the larger side, so every shape gets the same label room.
  const pad = big * 0.1
  const font = big * 0.045
  const svg = el('svg', {
    viewBox: `${b.minX - pad} ${b.minY - pad} ${w + 2 * pad} ${h + 2 * pad}`,
    role: 'img',
    'aria-label': `${d.name} tag preview`,
  })
  svg.append(el('path', { class: 'tag', d: tagPathData(d), 'fill-rule': 'evenodd' }))

  // Dimension labels.
  const midX = (b.minX + b.maxX) / 2
  const midY = (b.minY + b.maxY) / 2
  svg.append(
    el('text', { class: 'dim', x: midX, y: b.maxY + pad * 0.65, 'text-anchor': 'middle', 'font-size': font }, formatLength(d.width, unit)),
  )
  const lx = b.minX - pad * 0.4
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

  if (state.editing && d.points) {
    const r = big * 0.014
    const hitR = big * 0.028
    const nodes = buildOutline(d)
    const lines = el('g')
    const handles = el('g')
    const anchors = el('g')
    nodes.forEach((n, index) => {
      for (const part of ['hIn', 'hOut'] as const) {
        const h = n[part]
        if (Math.hypot(h.x - n.p.x, h.y - n.p.y) < 1e-6) continue
        lines.append(el('line', { class: 'bz-line', x1: n.p.x, y1: n.p.y, x2: h.x, y2: h.y }))
        handles.append(
          el('circle', { class: 'bz-handle', cx: h.x, cy: h.y, r }),
          el('circle', { class: 'hit bz-hit', 'data-drag': 'node', 'data-index': index, 'data-part': part, cx: h.x, cy: h.y, r: r * 1.3 }),
        )
      }
      anchors.append(
        el('rect', { class: 'bz-anchor', x: n.p.x - r, y: n.p.y - r, width: 2 * r, height: 2 * r }),
        el('rect', {
          class: 'hit bz-hit',
          'data-drag': 'node',
          'data-index': index,
          'data-part': 'p',
          x: n.p.x - hitR,
          y: n.p.y - hitR,
          width: 2 * hitR,
          height: 2 * hitR,
        }),
      )
    })
    // Handles go last so they win over an anchor they overlap.
    svg.append(lines, anchors, handles)
  }

  root.replaceChildren(svg)
}
