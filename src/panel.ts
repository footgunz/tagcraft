import type { Design, EndStyle, ShapeSettings } from './design'
import { PRESETS } from './design'
import { settleDesign } from './hole'
import { buildOutline, naturalAspect } from './shapes'
import { layoutSheet, SHEET_PRESETS, type Sheet, type SheetSize } from './sheet'
import { contourBounds } from './contour'
import { tagPathData } from './svg'
import { fromMm, toMm, type Unit } from './units'

export interface AppState {
  design: Design
  unit: Unit
  editing: boolean
  status: string
  /** Saved designs (from storage), shown after the built-ins. */
  saved: Design[]
  /** False when browser storage is unavailable (saving disabled). */
  canSave: boolean
  /** Tag: the editor. Sheet: read-only layout of copies, and what the export buttons export. */
  view: 'tag' | 'sheet'
  sheet: Sheet
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
  updateSheet(patch: (s: Sheet) => Sheet): void
}

/** Trimmed, case-insensitive name comparison (matches storage's rule). */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export interface PresetEntry {
  design: Design
  saved: boolean
  active: boolean
}

/** Built-ins first, then saved designs; the active one is matched by exact name. */
export function presetEntries(saved: Design[], current: Design): PresetEntry[] {
  const mk = (design: Design, isSaved: boolean) => ({ design, saved: isSaved, active: sameName(design.name, current.name) })
  return [...PRESETS.map((p) => mk(p, false)), ...saved.filter((s) => !PRESETS.some((p) => sameName(p.name, s.name))).map((s) => mk(s, true))]
}

/** Deep equality, with float slack for numbers that went through normalizing. */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return a === b
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/** True when the design is a built-in preset exactly as it loads, so there's nothing to save. */
export function isUnchangedPreset(d: Design): boolean {
  return PRESETS.some((p) => same(settleDesign(p).design, d))
}

// Two-click remove confirmation. Lives at module level so it survives panel re-renders;
// the timer always acts on the latest render callback and re-checks the name.
let pendingRemove: { name: string; timer: ReturnType<typeof setTimeout> } | null = null
let latestRerender: (() => void) | null = null
const CONFIRM_MS = 3000

function clearPending() {
  if (pendingRemove) clearTimeout(pendingRemove.timer)
  pendingRemove = null
}

const SOURCE_URL = 'https://github.com/footgunz/tagcraft'

/** A release tag (v1.2.3) links to its release; any other build (git describe, dev) is plain text. */
export function versionLink(version: string): { text: string; href: string | null } {
  return /^v\d+\.\d+\.\d+$/.test(version)
    ? { text: version, href: `${SOURCE_URL}/releases/tag/${version}` }
    : { text: version, href: null }
}

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

const SIZE_LABELS: [SheetSize, string][] = [
  ['letter', SHEET_PRESETS.letter.label],
  ['a4', SHEET_PRESETS.a4.label],
  ['custom', 'Custom'],
]

/** The Sheet section's summary line; `fits` is false when not even one copy fits. */
export function sheetSummary(d: Design, sheet: Sheet): { text: string; fits: boolean } {
  const max = layoutSheet(d, { ...sheet, count: null }).length
  if (max === 0) return { text: "The tag doesn't fit on this sheet, even turned", fits: false }
  const placed = layoutSheet(d, sheet)
  const count = (...rs: number[]) => placed.filter((p) => rs.includes(p.rotation)).length
  const upright = count(0)
  const flipped = count(180)
  const turned = count(90, 270)
  const parts = [upright && `${upright} upright`, flipped && `${flipped} flipped`, turned && `${turned} turned`].filter(Boolean).join(', ')
  const head = placed.length < max ? `Cutting ${placed.length} of ${max}` : `${max} ${max === 1 ? 'tag fits' : 'tags fit'}`
  return { text: `${head} · ${parts}`, fits: true }
}

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

/** The Sheet section: paper size, margin, gap, count, and what fits. */
function sheetSection(root: HTMLElement, state: AppState, actions: PanelActions, rerender: () => void): void {
  const { design: d, unit, sheet: sh } = state
  const sheetSec = section(root, 'Sheet')
  const setSheet = (patch: Partial<Sheet>) => actions.updateSheet((x) => ({ ...x, ...patch }))
  selectRow(sheetSec, 'Size', SIZE_LABELS, sh.size, (v) => setSheet({ size: v }))
  if (sh.size === 'custom') {
    numberRow(sheetSec, 'Width', sh.customWidth, unit, { length: true }, (v) => setSheet({ customWidth: v }), rerender)
    numberRow(sheetSec, 'Height', sh.customHeight, unit, { length: true }, (v) => setSheet({ customHeight: v }), rerender)
  }
  numberRow(sheetSec, 'Margin', sh.margin, unit, { length: true }, (v) => setSheet({ margin: v }), rerender)
  numberRow(sheetSec, 'Gap', sh.gap, unit, { length: true }, (v) => setSheet({ gap: v }), rerender)
  // Count: empty (or 0, one step down from 1) means as many as fit.
  const most = layoutSheet(d, { ...sh, count: null }).length
  const count = document.createElement('input')
  count.type = 'number'
  count.id = 'sheet-count'
  // While empty, the up arrow starts at 1; once set, the down arrow can reach 0.
  count.min = sh.count === null ? '1' : '0'
  count.step = '1'
  count.placeholder = `All that fit (${most})`
  count.value = sh.count === null ? '' : String(sh.count)
  count.addEventListener('change', () => {
    if (count.value.trim() === '') return setSheet({ count: null })
    const v = count.valueAsNumber
    if (!Number.isFinite(v)) return rerender()
    setSheet({ count: v < 1 ? null : v })
  })
  const countRow = row(sheetSec, 'Count', count)
  if (sh.count !== null) {
    const all = document.createElement('button')
    all.type = 'button'
    all.className = 'link-button'
    all.textContent = 'All'
    all.title = 'Cut as many as fit on the sheet'
    all.addEventListener('click', (e) => {
      // Inside the row's label: don't also focus the field.
      e.preventDefault()
      setSheet({ count: null })
    })
    countRow.querySelector('output')!.append(all)
  }
  const summary = sheetSummary(d, sh)
  const note = document.createElement('p')
  note.className = 'sheet-summary' + (summary.fits ? '' : ' error')
  note.textContent = summary.text
  sheetSec.append(note)
}

/** The Save section: name the design and store it with the presets. */
function saveSection(root: HTMLElement, state: AppState, actions: PanelActions): void {
  const save = section(root, 'Save')
  const nameInput = document.createElement('input')
  nameInput.type = 'text'
  nameInput.id = 'save-name'
  nameInput.value = state.design.name
  nameInput.maxLength = 60
  nameInput.placeholder = 'Design name'
  const saveBtn = document.createElement('button')
  saveBtn.type = 'button'
  saveBtn.className = 'action'
  saveBtn.textContent = 'Save design'
  saveBtn.disabled = !state.canSave
  saveBtn.title = state.canSave ? 'Save this design in the preset grid' : 'Browser storage is unavailable'
  const doSave = () => state.canSave && actions.saveAs(nameInput.value)
  saveBtn.addEventListener('click', doSave)
  nameInput.addEventListener('keydown', (ev) => ev.key === 'Enter' && doSave())
  row(save, 'Name', nameInput)
  save.append(saveBtn)
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
    `<span class="brand-links"><a class="source-link" href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer">Source code</a></span>`
  // Which build this is, so a copy of the app can be told apart from another.
  const v = versionLink(__APP_VERSION__)
  const version = document.createElement(v.href ? 'a' : 'span')
  version.className = 'version'
  version.textContent = v.text
  version.title = v.href ? `Tagcraft ${v.text}: release notes` : 'Development build'
  if (v.href && version instanceof HTMLAnchorElement) {
    version.href = v.href
    version.target = '_blank'
    version.rel = 'noopener noreferrer'
  }
  head.querySelector('.brand-links')!.prepend(version)
  root.append(head)

  // Presets: built-ins, then saved designs (with a remove control).
  latestRerender = rerender
  const presets = section(root, 'Preset')
  const grid = document.createElement('div')
  grid.className = 'presets'
  for (const e of presetEntries(state.saved, d)) {
    const p = e.design
    const item = document.createElement('div')
    item.className = 'preset-item'
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'preset' + (e.active ? ' active' : '')
    b.title = e.saved ? `Load ${p.name}` : `Load the ${p.name} preset`
    const label = document.createElement('span')
    label.className = 'preset-name'
    label.textContent = p.name
    b.append(thumbnail(p), label)
    b.addEventListener('click', () => actions.loadDesign(p))
    item.append(b)
    if (e.saved) {
      const x = document.createElement('button')
      x.type = 'button'
      const confirming = pendingRemove !== null && sameName(pendingRemove.name, p.name)
      x.className = 'remove' + (confirming ? ' confirm' : '')
      x.textContent = confirming ? 'Remove?' : '\u00d7'
      x.title = confirming ? `Click again to remove ${p.name}` : `Remove ${p.name}`
      x.setAttribute('aria-label', confirming ? `Confirm removing ${p.name}` : `Remove ${p.name}`)
      x.addEventListener('click', () => {
        if (pendingRemove && sameName(pendingRemove.name, p.name)) {
          clearPending()
          actions.removeSaved(p.name)
          return
        }
        clearPending()
        const name = p.name
        const timer = setTimeout(() => {
          if (pendingRemove?.timer !== timer) return
          pendingRemove = null
          latestRerender?.()
        }, CONFIRM_MS)
        pendingRemove = { name, timer }
        rerender()
      })
      item.append(x)
    }
    grid.append(item)
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

  // Sheet: the paper the copies are laid out on. Only shown in the Sheet view.
  if (state.view === 'sheet') sheetSection(root, state, actions, rerender)

  // Save: hidden until the design differs from the built-in preset it came from.
  if (!isUnchangedPreset(d)) saveSection(root, state, actions)

  root.scrollTop = scroll
}
