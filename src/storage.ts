import { PRESETS, normalizeDesign, type Design } from './design'

export interface Store {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

export type SaveResult = 'ok' | 'invalid-name' | 'write-failed'

export interface DesignStorage {
  available: boolean
  listSaved(): Design[]
  save(d: Design): SaveResult
  remove(name: string): void
  loadCurrent(): Design | null
  saveCurrent(d: Design): void
}

const DESIGNS_KEY = 'tagcraft:designs'
const CURRENT_KEY = 'tagcraft:current'

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function defaultStore(): Store | null {
  try {
    if (typeof window === 'undefined') return null
    const ls = window.localStorage
    const probe = 'tagcraft:probe'
    ls.setItem(probe, '1')
    ls.removeItem(probe)
    return ls
  } catch {
    return null
  }
}

export function createStorage(store: Store | null): DesignStorage {
  const readSaved = (): Design[] => {
    if (!store) return []
    try {
      const raw = store.getItem(DESIGNS_KEY)
      if (raw === null) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((e) => typeof e === 'object' && e !== null && !Array.isArray(e))
        .map((e) => normalizeDesign(e))
    } catch {
      return []
    }
  }

  const writeSaved = (list: Design[]): boolean => {
    if (!store) return false
    try {
      store.setItem(DESIGNS_KEY, JSON.stringify(list))
      return true
    } catch {
      return false
    }
  }

  return {
    available: store !== null,
    listSaved: readSaved,
    save(d) {
      const name = d.name.trim()
      if (!name || PRESETS.some((p) => sameName(p.name, name))) return 'invalid-name'
      if (!store) return 'write-failed'
      const entry = { ...d, name }
      const list = readSaved()
      const i = list.findIndex((x) => sameName(x.name, name))
      if (i >= 0) list[i] = entry
      else list.push(entry)
      return writeSaved(list) ? 'ok' : 'write-failed'
    },
    remove(name) {
      if (!store) return
      writeSaved(readSaved().filter((x) => !sameName(x.name, name)))
    },
    loadCurrent() {
      if (!store) return null
      try {
        const raw = store.getItem(CURRENT_KEY)
        if (raw === null) return null
        return normalizeDesign(JSON.parse(raw))
      } catch {
        return null
      }
    },
    saveCurrent(d) {
      if (!store) return
      try {
        store.setItem(CURRENT_KEY, JSON.stringify(d))
      } catch {
        /* ignore */
      }
    },
  }
}
