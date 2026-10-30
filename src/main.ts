import './style.css'
import { normalizeContour, type Contour } from './contour'
import { PRESETS, normalizeDesign, type Design, type Hole } from './design'
import { clampHole, holeWallOk } from './hole'
import { applyPointEdit, buildOutline } from './shapes'
import { renderPanel, syncHoleFields, type AppState, type PanelActions } from './panel'
import { renderPreview, type PreviewActions } from './preview'
import { createStorage, defaultStore } from './storage'
import { designToSvg, svgFilename } from './svg'
import type { Unit } from './units'

const storage = createStorage(defaultStore())

const state: AppState = { design: PRESETS[0], unit: 'in', editing: false, status: '' }

const controlsEl = document.getElementById('controls')!
const previewEl = document.getElementById('preview')!
const statusEl = document.getElementById('status')!

const STORAGE_MSG = "Browser storage is unavailable; designs won't be saved"

const HINT = 'Drag the hole to move it \u00b7 drag its edge dot to resize'

function renderStatus() {
  statusEl.textContent = state.status || HINT
  statusEl.classList.toggle('error', state.status.startsWith('Warning'))
}

function render() {
  renderPanel(controlsEl, state, panelActions)
  renderPreview(previewEl, state, previewActions)
  renderStatus()
}

/** Every committed design change goes through here: repair, keep the hole wall, report, save. */
function commit(next: Design) {
  const { design, adjusted } = clampHole(normalizeDesign(next))
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
    state.status = storage.save({ ...state.design, name }) ? `Saved "${name.trim()}"` : 'Could not save this design'
    render()
  },
  removeSaved(name) {
    storage.remove(name)
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
    if (final) return commit(next)
    state.design = next
    renderPreview(previewEl, state, previewActions)
    syncHoleFields(controlsEl, state)
  },
}

function setStatus(msg: string) {
  state.status = msg
  renderStatus()
}

document.getElementById('download')!.addEventListener('click', () => {
  const blob = new Blob([designToSvg(state.design, state.unit)], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = svgFilename(state.design)
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  setStatus(`Downloaded ${a.download}`)
})

document.getElementById('copy')!.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(designToSvg(state.design, state.unit))
    setStatus('SVG copied to the clipboard')
  } catch {
    setStatus('Warning: could not copy to the clipboard')
  }
})

commit(storage.loadCurrent() ?? PRESETS[0])
