import './style.css'
import { normalizeContour, type Contour } from './contour'
import { normalizeDesign, PRESETS, type Design, type Hole, type TextBox } from './design'
import { holeWallOk, settleDesign } from './hole'
import { applyPointEdit, buildOutline } from './shapes'
import { renderPanel, syncHoleFields, syncTextFields, type AppState, type PanelActions } from './panel'
import { renderPreview, type PreviewActions } from './preview'
import { DEFAULT_SHEET, layoutSheet, normalizeSheet } from './sheet'
import { createStorage, defaultStore } from './storage'
import { designToSvg, sheetSvgFilename, sheetToSvg, svgFilename } from './svg'
import { checkForUpdate } from './update'
import { addFont, DEFAULT_FONT, loadedFont, loadFont, resolveFont } from './fontlist'
import { defaultText, textBoxOverlapsHole } from './text'
import { borderPaths } from './border'
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

const TEXT_HINT = 'Drag the hole to move it \u00b7 drag the text box to move it, its handles to resize it, or its top dot to turn it (Shift: 15\u00b0 steps)'

function renderStatus() {
  const hint = state.view === 'sheet' ? SHEET_HINT : state.design.text && !state.editing ? TEXT_HINT : HINT
  statusEl.textContent = state.status || hint
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
  else if (design.border && borderPaths(design, design.border).collapsed)
    state.status = "Warning: the border inset is too big for this shape, so there's no border"
  else if (design.text && resolveFont(design.text.font).fellBack)
    state.status = `The font "${design.text.font}" isn't available here, so ${DEFAULT_FONT} is used`
  else if (textBoxOverlapsHole(design)) state.status = 'The text box overlaps the hole, so text there is left out'
  else state.status = storage.available ? '' : STORAGE_MSG
  render()
  storage.saveCurrent(state.design)
  loadTextFont()
}

/** Fonts load on first use: once the text's font is ready, draw again. */
function loadTextFont() {
  const t = state.design.text
  if (t && !loadedFont(t.font)) void loadFont(t.font).then(render)
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
  updateText(patch, live = false) {
    const d = state.design
    const next = { ...d, text: patch(d.text ?? defaultText(d)) }
    if (!live) return commit(next)
    // While typing: redraw the preview and save, but leave the panel (and the caret) alone.
    state.design = normalizeDesign(next)
    renderPreview(previewEl, state, previewActions)
    storage.saveCurrent(state.design)
  },
  addFont(file) {
    void (async () => {
      try {
        const entry = addFont(file.name, await file.arrayBuffer())
        commit({ ...state.design, text: { ...(state.design.text ?? defaultText(state.design)), font: entry.name } })
        setStatus(`Added ${entry.name} for this session${entry.singleLine ? '' : ': an outline font, so a pen draws hollow letters'}`)
      } catch {
        setStatus(`Warning: couldn't read ${file.name} as a font`)
      }
    })()
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
  setTextBox(box: TextBox, final: boolean) {
    const t = state.design.text
    if (!t) return
    const next = { ...state.design, text: { ...t, box } }
    if (final) return commit(next)
    state.design = next
    renderPreview(previewEl, state, previewActions)
  },
  setTextRotation(rotation: number, final: boolean, from?: TextBox) {
    const t = state.design.text
    if (!t) return
    // The box may move or shrink so its turned corners stay on the tag; fit it from the box at the
    // start of the turn, so turning back and forth doesn't keep shrinking it.
    const next = { ...state.design, text: { ...t, rotation, box: from ?? t.box } }
    if (final) return commit(next)
    state.design = normalizeDesign(next)
    renderPreview(previewEl, state, previewActions)
    syncTextFields(controlsEl, state)
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

/** What the export buttons produce in the current view, once the text's font has loaded. */
async function exportSvg(): Promise<{ svg: string; filename: string }> {
  if (state.design.text) await loadFont(state.design.text.font)
  return state.view === 'sheet'
    ? { svg: sheetToSvg(state.design, state.sheet, state.unit), filename: sheetSvgFilename(state.design, state.sheet) }
    : { svg: designToSvg(state.design, state.unit), filename: svgFilename(state.design) }
}

downloadBtn.addEventListener('click', async () => {
  const { svg, filename } = await exportSvg()
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
    await navigator.clipboard.writeText((await exportSvg()).svg)
    setStatus(state.view === 'sheet' ? 'Sheet SVG copied to the clipboard' : 'SVG copied to the clipboard')
  } catch {
    setStatus('Warning: could not copy to the clipboard')
  }
})

commit(storage.loadCurrent() ?? PRESETS[0])
void checkForUpdate(__APP_VERSION__)
// Fonts are parsed on first use; start on the default one so text is ready when needed.
void loadFont(DEFAULT_FONT)
