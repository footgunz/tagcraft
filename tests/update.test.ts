import { describe, expect, it } from 'vitest'
import { cleanedHref, updateTarget } from '../src/update'

const SITE = 'https://footgunz.github.io/tagcraft/'

describe('updateTarget', () => {
  it('sends an older copy to a fresh address for the live version', () => {
    expect(updateTarget('v0.0.3', 'v0.0.4', SITE)).toBe(`${SITE}?v=v0.0.4`)
  })
  it('keeps other query parameters', () => {
    expect(updateTarget('v0.0.3', 'v0.0.4', `${SITE}?x=1`)).toBe(`${SITE}?x=1&v=v0.0.4`)
  })
  it('stays when up to date', () => expect(updateTarget('v0.0.4', 'v0.0.4', SITE)).toBeNull())
  it('never asks for the same version twice, so a stale cache cannot loop', () => {
    expect(updateTarget('v0.0.3', 'v0.0.4', `${SITE}?v=v0.0.4`)).toBeNull()
  })
  it('ignores a missing or odd version file', () => {
    for (const latest of [undefined, null, '', 4, { v: 1 }]) expect(updateTarget('v0.0.3', latest, SITE)).toBeNull()
  })
})

describe('cleanedHref', () => {
  it('drops ?v= once the page is that version', () => {
    expect(cleanedHref('v0.0.4', `${SITE}?v=v0.0.4`)).toBe(SITE)
    expect(cleanedHref('v0.0.4', `${SITE}?x=1&v=v0.0.4`)).toBe(`${SITE}?x=1`)
  })
  it('leaves other addresses alone', () => {
    expect(cleanedHref('v0.0.4', SITE)).toBeNull()
    expect(cleanedHref('v0.0.3', `${SITE}?v=v0.0.4`)).toBeNull()
  })
})
