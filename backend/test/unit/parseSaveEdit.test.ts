import { describe, expect, it } from 'vitest'
import { MAX_TEXT_LENGTH, parseSaveEdit } from '../../src/services/reviewService.js'
import { AppError } from '../../src/domain/errors.js'

describe('parseSaveEdit (unit): R6 request validation', () => {
  it('accepts text only, done only, or both', () => {
    expect(parseSaveEdit({ base_version: 0, text_en: 'Hi' })).toEqual({ patch: { text_en: 'Hi' }, baseVersion: 0 })
    expect(parseSaveEdit({ base_version: 3, is_done: true })).toEqual({ patch: { is_done: true }, baseVersion: 3 })
    expect(parseSaveEdit({ base_version: 1, text_en: 'x', is_done: false }).patch).toEqual({ text_en: 'x', is_done: false })
  })

  it('allows clearing the text to an empty string', () => {
    expect(parseSaveEdit({ base_version: 2, text_en: '' }).patch).toEqual({ text_en: '' })
  })

  it.each([
    ['null body', null],
    ['array body', []],
    ['missing base_version', { text_en: 'x' }],
    ['negative base_version', { base_version: -1, text_en: 'x' }],
    ['fractional base_version', { base_version: 1.5, text_en: 'x' }],
    ['string base_version', { base_version: '1', text_en: 'x' }],
    ['no editable field', { base_version: 1 }],
    ['non-string text', { base_version: 1, text_en: 42 }],
    ['non-boolean done', { base_version: 1, is_done: 'yes' }],
    ['text over the limit', { base_version: 1, text_en: 'a'.repeat(MAX_TEXT_LENGTH + 1) }],
  ])('rejects %s with 400', (_label, body) => {
    expect(() => parseSaveEdit(body)).toThrow(AppError)
    try {
      parseSaveEdit(body)
    } catch (e) {
      expect((e as AppError).status).toBe(400)
    }
  })
})
