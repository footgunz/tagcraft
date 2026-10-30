import './style.css'
import { normalizeContour, type Contour } from './contour'
import { PRESETS, type Design, type Hole } from './design'
import { holeWallOk, settleDesign } from './hole'
import { applyPointEdit, buildOutline } from './shapes'
import { renderPanel, syncHoleFields, type AppState, type PanelActions } from './panel'
import { renderPreview, type PreviewActions } from './preview'
import { DEFAULT_SHEET, layoutSheet, normalizeSheet } from './sheet'
import { createStorage, defaultStore } from './storage'
import { designToSvg, sheetSvgFilename, sheetToSvg, svgFilename } from './svg'
import { checkForUpdate } from './update'
import type { Unit } from './units'

const storage = createStorage(defaultStore())

const state: AppState = {
  design: PRESETS[0],
  unit: 'in',
  editing: false,
  status: '',
  saved: [],
  canSave: storage.available,
  view: 'tag',
  sheet: storage.loadSheet() ?? DEFAULT_SHEET,
}

const controlsEl = document.getElementById('controls')!
const previewEl = document.getElementById('preview')!
const statusEl = document.getElementById('status')!
const viewEl = document.getElementById('view')!
const downloadBtn = document.getElementById('download') as HTMLButtonElement
const copyBtn = document.getElementById('copy') as HTMLButtonElement

const STORAGE_MSG = "Browser storage is unavailable; designs won't be saved"

const HINT = 'Drag the hole to move it \u00b7 drag its edge dot to resize'

const SHEET_HINT = 'Tags are packed from the top-left so the leftover paper stays in one piece'

function renderStatus() {
  statusEl.textContent = state.status || (state.view === 'sheet' ? SHEET_HINT : HINT)
  statusEl.classList.toggle('error', state.status.startsWith('Warning'))
}

/** The toolbar follows the view: in Sheet view the buttons export the sheet. */
function renderToolbar() {
  for (const b of viewEl.querySelectorAll<HTMLButtonElement>('button')) {
    const on = b.dataset.view === state.view
    b.classList.toggle('active', on)
    b.setAttribute('aria-pressed', String(on))
  }
  const sheet = state.view === 'sheet'
  downloadBtn.textContent = sheet ? 'Download sheet SVG' : 'Download SVG'
  copyBtn.textContent = sheet ? 'Copy sheet SVG' : 'Copy SVG'
  const empty = sheet && layoutSheet(state.design, state.sheet).length === 0
  downloadBtn.disabled = empty
  copyBtn.disabled = empty
}

function render() {
  state.saved = storage.listSaved()
  renderPanel(controlsEl, state, panelActions)
  renderPreview(previewEl, state, previewActions)
  renderToolbar()
  renderStatus()
}

/**
 * Every committed design change goes through here: repair, keep the hole wall, report, save.
 * Outline (node) edits pass `clamp: false`: they are never blocked and only warn.
 */
function commit(next: Design, opts: { clamp?: boolean } = {}) {
  const { design, adjusted } = settleDesign(next, opts)
  state.design = design
  if (!design.points) state.editing = false
  if (!holeWallOk(design)) state.status = 'Warning: the outline is closer than 1/8" to the hole'
  else if (adjusted) state.status = 'Hole adjusted to keep a 1/8" wall'
  else state.status = storage.available ? '' : STORAGE_MSG
  render()
  storage.saveCurrent(state.design)
}

const panelActions: PanelActions = {
  update: (patch) => commit(patch(state.design)),
  setUnit(u: Unit) {
    state.unit = u
    render()
  },
  loadDesign: (d) => commit(d),
  startEditing() {
    const d = state.design
    state.editing = true
    state.view = 'tag'
    // Convert the current shape to editable nodes (once per design).
    commit(
      d.points
        ? d
        : { ...d, lockProportions: false, points: normalizeContour(buildOutline(d), d.width, d.height) },
    )
  },
  stopEditing() {
    state.editing = false
    render()
  },
  resetPoints() {
    state.editing = false
    commit({ ...state.design, points: null })
  },
  saveAs(name) {
    const trimmed = name.trim()
    const result = storage.available ? storage.save({ ...state.design, name: trimmed }) : null
    if (result === null) {
      state.status = STORAGE_MSG
    } else if (result === 'ok') {
      state.design = { ...state.design, name: trimmed }
      state.status = 'Saved'
      storage.saveCurrent(state.design)
    } else if (result === 'write-failed') {
      state.status = "Couldn't save: browser storage is full or unavailable"
    } else {
      state.status = "Enter a name that isn't a built-in preset"
    }
    render()
  },
  removeSaved(name) {
    storage.remove(name)
    render()
  },
  updateSheet(patch) {
    state.sheet = normalizeSheet(patch(state.sheet))
    storage.saveSheet(state.sheet)
    render()
  },
}

const previewActions: PreviewActions = {
  setHole(h: Hole, final: boolean) {
    if (final) return commit({ ...state.design, hole: h })
    // Mid-drag: preview only, no clamping or saving, and the panel keeps its focus.
    state.design = { ...state.design, hole: h }
    renderPreview(previewEl, state, previewActions)
    syncHoleFields(controlsEl, state)
  },
  // `outline` is the edited outline in mm; applyPointEdit re-fits width/height to it.
  setPoints(outline: Contour, final: boolean) {
    const next = applyPointEdit(state.design, outline)
    if (final) return commit(next, { clamp: false })
    state.design = next
    renderPreview(previewEl, state, previewActions)
    syncHoleFields(controlsEl, state)
  },
}

function setStatus(msg: string) {
  state.status = msg
  renderStatus()
}

viewEl.addEventListener('click', (e) => {
  const view = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.view
  if ((view !== 'tag' && view !== 'sheet') || view === state.view) return
  state.view = view
  state.status = ''
  render()
})

/** What the export buttons produce in the current view. */
function exportSvg(): { svg: string; filename: string } {
  return state.view === 'sheet'
    ? { svg: sheetToSvg(state.design, state.sheet, state.unit), filename: sheetSvgFilename(state.design, state.sheet) }
    : { svg: designToSvg(state.design, state.unit), filename: svgFilename(state.design) }
}

downloadBtn.addEventListener('click', () => {
  const { svg, filename } = exportSvg()
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  setStatus(`Downloaded ${a.download}`)
})

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(exportSvg().svg)
    setStatus(state.view === 'sheet' ? 'Sheet SVG copied to the clipboard' : 'SVG copied to the clipboard')
  } catch {
    setStatus('Warning: could not copy to the clipboard')
  }
})

commit(storage.loadCurrent() ?? PRESETS[0])
void checkForUpdate(__APP_VERSION__)
