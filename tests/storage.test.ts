import { beforeEach, describe, expect, it } from 'vitest'
import { PRESETS } from '../src/design'
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
    expect(s.save({ ...PRESETS[0], name: 'A' })).toBe(true)
    expect(s.listSaved()).toHaveLength(1)
    expect(s.save({ ...PRESETS[0], name: 'A', width: 50 })).toBe(true)
    const list = s.listSaved()
    expect(list).toHaveLength(1)
    expect(list[0].width).toBe(50)
    s.remove('A')
    expect(s.listSaved()).toEqual([])
  })

  it('rejects empty and preset names', () => {
    expect(s.save({ ...PRESETS[0], name: '  ' })).toBe(false)
    expect(s.save({ ...PRESETS[0], name: 'gift TAG' })).toBe(false)
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
    expect(() => t.save({ ...PRESETS[0], name: 'Y' })).not.toThrow()
    expect(t.listSaved()).toEqual([])
    expect(t.loadCurrent()).toBeNull()
    expect(() => t.saveCurrent(PRESETS[0])).not.toThrow()
    expect(() => t.remove('Y')).not.toThrow()
  })

  it('null store is unavailable', () => {
    const n = createStorage(null)
    expect(n.available).toBe(false)
    expect(n.save({ ...PRESETS[0], name: 'Z' })).toBe(false)
    expect(n.listSaved()).toEqual([])
    expect(n.loadCurrent()).toBeNull()
  })

  it('defaultStore is null without a window', () => {
    expect(defaultStore()).toBeNull()
  })
})
