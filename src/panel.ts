import type { Design, EndStyle, ShapeSettings } from './design'
import { PRESETS } from './design'
import { buildOutline, naturalAspect } from './shapes'
import { contourBounds } from './contour'
import { tagPathData } from './svg'
import { fromMm, toMm, type Unit } from './units'

export interface AppState {
  design: Design
  unit: Unit
  editing: boolean
  status: string
}

export interface PanelActions {
  update(patch: (d: Design) => Design): void
  setUnit(u: Unit): void
  loadDesign(d: Design): void
  startEditing(): void
  stopEditing(): void
  resetPoints(): void
  saveAs(name: string): void
  removeSaved(name: string): void
}

const SOURCE_URL = 'https://github.com/footgunz/tagcraft'

type Kind = ShapeSettings['kind']
const KIND_LABELS: [Kind, string][] = [
  ['rectangle', 'Rectangle'],
  ['polygon', 'Polygon'],
  ['star', 'Star'],
  ['wavy', 'Wavy'],
  ['ellipse', 'Ellipse'],
  ['oval', 'Oval'],
]
const END_LABELS: [EndStyle, string][] = [
  ['square', 'Square'],
  ['clipped', 'Clipped'],
  ['rounded', 'Rounded'],
]

const canLock = (k: Kind) => k === 'polygon' || k === 'star' || k === 'ellipse'

/** Merge settings into the current shape (kind is preserved). */
function withShape(d: Design, patch: Record<string, unknown>): Design {
  return { ...d, shape: { ...d.shape, ...patch } as ShapeSettings }
}

/** Switch base shape: keeps size and hole, takes that kind's settings and lock from its preset. */
export function switchKind(d: Design, kind: Kind): Design {
  const base = PRESETS.find((p) => p.shape.kind === kind)!
  return { ...d, shape: { ...base.shape }, points: null, lockProportions: base.lockProportions }
}

function section(root: HTMLElement, title: string): HTMLElement {
  const s = document.createElement('section')
  const h = document.createElement('h2')
  h.textContent = title
  s.append(h)
  root.append(s)
  return s
}

function row(parent: HTMLElement, label: string, control: HTMLElement, suffix = ''): HTMLElement {
  const r = document.createElement('label')
  r.className = 'row'
  const l = document.createElement('span')
  l.className = 'label'
  l.textContent = label
  const o = document.createElement('output')
  o.textContent = suffix
  r.append(l, control, o)
  parent.append(r)
  return r
}

function shown(v: number, digits: number): string {
  return String(Number(v.toFixed(digits)))
}

interface NumOpts {
  id?: string
  length?: boolean // mm internally, shown in the display unit
  step?: number
}

function numberRow(
  parent: HTMLElement,
  label: string,
  mmOrRaw: number,
  unit: Unit,
  opts: NumOpts,
  onChange: (value: number) => void,
  rerender: () => void,
): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'number'
  if (opts.id) input.id = opts.id
  const len = opts.length ?? false
  input.value = shown(len ? fromMm(mmOrRaw, unit) : mmOrRaw, len ? (unit === 'in' ? 3 : 2) : 2)
  input.step = String(opts.step ?? (len ? (unit === 'in' ? 0.01 : 0.1) : 1))
  input.addEventListener('change', () => {
    const v = input.valueAsNumber
    // Unparseable or empty input: restore the displayed value instead of resetting the field.
    if (!Number.isFinite(v)) return rerender()
    onChange(len ? toMm(v, unit) : v)
  })
  row(parent, label, input, len ? unit : '')
  return input
}

function selectRow<T extends string>(
  parent: HTMLElement,
  label: string,
  options: [T, string][],
  value: T,
  onChange: (v: T) => void,
): void {
  const sel = document.createElement('select')
  for (const [id, text] of options) sel.append(new Option(text, id))
  sel.value = value
  sel.addEventListener('change', () => onChange(sel.value as T))
  row(parent, label, sel)
}

function checkRow(parent: HTMLElement, label: string, value: boolean, onChange: (v: boolean) => void): void {
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = value
  box.addEventListener('change', () => onChange(box.checked))
  const r = document.createElement('label')
  r.className = 'row check'
  const span = document.createElement('span')
  span.textContent = label
  r.append(box, span)
  parent.append(r)
}

/** Small preview of a design for the preset grid. */
export function thumbnail(d: Design): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const b = contourBounds(buildOutline(d))
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const pad = Math.max(w, h) * 0.04
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', `${b.minX - pad} ${b.minY - pad} ${w + 2 * pad} ${h + 2 * pad}`)
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', tagPathData(d))
  path.setAttribute('fill-rule', 'evenodd')
  svg.append(path)
  return svg
}

export function holeLabels(kind: Kind): { offset: string } {
  return { offset: kind === 'polygon' || kind === 'star' ? 'From top' : 'From end' }
}

/** Refresh just the hole number fields (used while dragging, so focus is never disturbed). */
export function syncHoleFields(root: HTMLElement, state: AppState): void {
  const set = (id: string, mm: number) => {
    const i = root.querySelector<HTMLInputElement>(`#${id}`)
    if (i) i.value = shown(fromMm(mm, state.unit), state.unit === 'in' ? 3 : 2)
  }
  set('hole-diameter', state.design.hole.diameter)
  set('hole-offset', state.design.hole.offset)
}

export function renderPanel(root: HTMLElement, state: AppState, actions: PanelActions): void {
  const { design: d, unit } = state
  const rerender = () => renderPanel(root, state, actions)
  const scroll = root.scrollTop
  root.replaceChildren()

  const head = document.createElement('div')
  head.className = 'brand'
  head.innerHTML =
    `<h1><a href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer" title="Tagcraft on GitHub">Tagcraft</a></h1>` +
    `<a class="source-link" href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer">Source code</a>`
  root.append(head)

  // Presets (built-ins; saved designs are added by the saved-designs task).
  const presets = section(root, 'Preset')
  const grid = document.createElement('div')
  grid.className = 'presets'
  for (const p of PRESETS) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'preset' + (p.name === d.name ? ' active' : '')
    b.title = `Load the ${p.name} preset`
    b.append(thumbnail(p), p.name)
    b.addEventListener('click', () => actions.loadDesign(p))
    grid.append(b)
  }
  presets.append(grid)

  // Units.
  const units = section(root, 'Units')
  const seg = document.createElement('div')
  seg.className = 'segmented'
  for (const u of ['in', 'mm'] as Unit[]) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = u
    b.className = u === unit ? 'active' : ''
    b.addEventListener('click', () => u !== unit && actions.setUnit(u))
    seg.append(b)
  }
  units.append(seg)

  // Shape.
  const shape = section(root, 'Shape')
  const s = d.shape
  selectRow(shape, 'Base shape', KIND_LABELS, s.kind, (k) => actions.update((x) => switchKind(x, k)))

  const aspect = naturalAspect(s)
  const locked = d.lockProportions && canLock(s.kind) && !d.points
  numberRow(shape, 'Width', d.width, unit, { length: true, id: 'shape-width' }, (v) => actions.update((x) => ({ ...x, width: v })), rerender)
  numberRow(
    shape,
    'Height',
    d.height,
    unit,
    { length: true, id: 'shape-height' },
    // normalizeDesign derives height from width when locked, so derive the width here.
    (v) => actions.update((x) => (locked ? { ...x, width: v / aspect } : { ...x, height: v })),
    rerender,
  )

  const lock = () =>
    canLock(s.kind) && checkRow(shape, 'Lock proportions', d.lockProportions, (v) => actions.update((x) => ({ ...x, lockProportions: v })))
  const num = (label: string, key: string, value: number, length: boolean, step?: number) =>
    numberRow(shape, label, value, unit, { length, step }, (v) => actions.update((x) => withShape(x, { [key]: v })), rerender)

  switch (s.kind) {
    case 'rectangle':
      selectRow(shape, 'End', END_LABELS, s.end, (v) => actions.update((x) => withShape(x, { end: v })))
      if (s.end === 'clipped') num('Clip', 'clip', s.clip, true)
      num('Rounding', 'rounding', s.rounding, true, unit === 'in' ? 0.005 : 0.05)
      break
    case 'polygon':
      num('Sides', 'sides', s.sides, false)
      num('Rounding', 'rounding', s.rounding, true, unit === 'in' ? 0.005 : 0.05)
      lock()
      break
    case 'star':
      num('Points', 'points', s.points, false)
      num('Depth', 'depth', s.depth, false, 0.01)
      num('Rounding', 'rounding', s.rounding, true, unit === 'in' ? 0.005 : 0.05)
      lock()
      break
    case 'wavy':
      selectRow(shape, 'End', END_LABELS, s.end, (v) => actions.update((x) => withShape(x, { end: v })))
      if (s.end === 'clipped') num('Clip', 'clip', s.clip, true)
      num('Waves', 'waves', s.waves, false)
      num('Wave height', 'waveHeight', s.waveHeight, true)
      break
    case 'ellipse':
      lock()
      break
    case 'oval':
      break
  }

  // Point editing: the shape settings are one-way disabled once points exist.
  if (d.points) {
    for (const c of shape.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'))
      if (c.id !== 'shape-width' && c.id !== 'shape-height') c.disabled = true
  }
  const edit = document.createElement('div')
  edit.className = 'edit-actions'
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'action' + (state.editing ? ' active' : '')
  toggle.textContent = state.editing ? 'Done editing' : 'Edit points\u2026'
  toggle.title = state.editing ? 'Stop editing points' : 'Edit the outline as bezier points'
  toggle.addEventListener('click', () => (state.editing ? actions.stopEditing() : actions.startEditing()))
  edit.append(toggle)
  if (d.points) {
    const reset = document.createElement('button')
    reset.type = 'button'
    reset.className = 'action'
    reset.textContent = 'Reset to shape'
    reset.title = 'Throw away point edits and return to the shape settings'
    reset.addEventListener('click', () => actions.resetPoints())
    edit.append(reset)
  }
  shape.append(edit)

  // Hole.
  const hole = section(root, 'Hole')
  numberRow(hole, 'Diameter', d.hole.diameter, unit, { length: true, id: 'hole-diameter', step: unit === 'in' ? 0.01 : 0.1 }, (v) =>
    actions.update((x) => ({ ...x, hole: { ...x.hole, diameter: v } })), rerender)
  numberRow(hole, holeLabels(s.kind).offset, d.hole.offset, unit, { length: true, id: 'hole-offset' }, (v) =>
    actions.update((x) => ({ ...x, hole: { ...x.hole, offset: v } })), rerender)

  root.scrollTop = scroll
}
