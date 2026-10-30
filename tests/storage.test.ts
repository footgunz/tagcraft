import { beforeEach, describe, expect, it } from 'vitest'
import { PRESETS } from '../src/design'
import { DEFAULT_SHEET } from '../src/sheet'
import { createStorage, defaultStore, type DesignStorage, type Store } from '../src/storage'

function memStore(): Store {
  const m = new Map<string, string>()
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => void m.set(k, v),
  }
}

const throwingStore: Store = {
  getItem: () => {
    throw new Error('no')
  },
  setItem: () => {
    throw new Error('no')
  },
}

describe('storage', () => {
  let mem: Store
  let s: DesignStorage
  beforeEach(() => {
    mem = memStore()
    s = createStorage(mem)
  })

  it('saves, lists, overwrites by name and removes', () => {
    expect(s.save({ ...PRESETS[0], name: 'A' })).toBe('ok')
    expect(s.listSaved()).toHaveLength(1)
    expect(s.save({ ...PRESETS[0], name: 'A', width: 50 })).toBe('ok')
    const list = s.listSaved()
    expect(list).toHaveLength(1)
    expect(list[0].width).toBe(50)
    s.remove('A')
    expect(s.listSaved()).toEqual([])
  })

  it('rejects empty and preset names', () => {
    expect(s.save({ ...PRESETS[0], name: '  ' })).toBe('invalid-name')
    expect(s.save({ ...PRESETS[0], name: 'gift TAG' })).toBe('invalid-name')
  })

  it('reports a failed write separately from a bad name', () => {
    const full = createStorage({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') } })
    expect(full.save({ ...PRESETS[0], name: 'A' })).toBe('write-failed')
    expect(full.save({ ...PRESETS[0], name: 'Gift tag' })).toBe('invalid-name')
  })

  it('overwrites case-insensitively and trims', () => {
    s.save({ ...PRESETS[0], name: 'A' })
    s.save({ ...PRESETS[0], name: ' a ', width: 55 })
    expect(s.listSaved()).toHaveLength(1)
    expect(s.listSaved()[0].width).toBe(55)
  })

  it('round-trips the current design', () => {
    expect(s.loadCurrent()).toBeNull()
    s.saveCurrent({ ...PRESETS[0], name: 'Cur' })
    expect(s.loadCurrent()?.name).toBe('Cur')
  })

  it('round-trips sheet settings, apart from designs', () => {
    expect(s.loadSheet()).toBeNull()
    s.saveSheet({ ...DEFAULT_SHEET, size: 'a4', count: 6 })
    expect(s.loadSheet()).toMatchObject({ size: 'a4', count: 6 })
    expect(s.loadCurrent()).toBeNull()
    expect(s.listSaved()).toEqual([])
  })

  it('repairs stored sheet settings', () => {
    mem.setItem('tagcraft:sheet', JSON.stringify({ size: 'poster', margin: -1 }))
    expect(s.loadSheet()).toMatchObject({ size: 'letter', margin: 0 })
    mem.setItem('tagcraft:sheet', '{nope')
    expect(s.loadSheet()).toBeNull()
  })

  it('survives corrupt JSON', () => {
    mem.setItem('tagcraft:designs', '{nope')
    expect(s.listSaved()).toEqual([])
    mem.setItem('tagcraft:current', '"str"')
    expect(s.loadCurrent()?.name).toBe('Gift tag')
  })

  it('repairs bad entries', () => {
    mem.setItem('tagcraft:designs', JSON.stringify([null, 3, { name: 'X', width: 'wide' }]))
    expect(s.listSaved().map((d) => d.name)).toEqual(['X'])
  })

  it('throwing store degrades to no-ops', () => {
    const t = createStorage(throwingStore)
    expect(t.save({ ...PRESETS[0], name: 'Y' })).toBe('write-failed')
    expect(t.listSaved()).toEqual([])
    expect(t.loadCurrent()).toBeNull()
    expect(() => t.saveCurrent(PRESETS[0])).not.toThrow()
    expect(t.loadSheet()).toBeNull()
    expect(() => t.saveSheet(DEFAULT_SHEET)).not.toThrow()
    expect(() => t.remove('Y')).not.toThrow()
  })

  it('null store is unavailable', () => {
    const n = createStorage(null)
    expect(n.available).toBe(false)
    expect(n.save({ ...PRESETS[0], name: 'Z' })).toBe('write-failed')
    expect(n.listSaved()).toEqual([])
    expect(n.loadCurrent()).toBeNull()
  })

  it('defaultStore is null without a window', () => {
    expect(defaultStore()).toBeNull()
  })
})
