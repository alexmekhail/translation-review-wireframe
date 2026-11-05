import { describe, expect, it } from 'vitest'
import { readSource } from '../../src/ingest/sourceReader.js'
import { AppError } from '../../src/domain/errors.js'
import { fixture } from '../helpers.js'

const limits = { maxBytes: 10_000, maxParagraphs: 5 }

function errorOf(fn: () => unknown): AppError {
  try {
    fn()
  } catch (e) {
    if (e instanceof AppError) return e
    throw e
  }
  throw new Error('expected an AppError')
}

describe('readSource (unit)', () => {
  it('splits a CRLF .txt fixture into paragraphs in reading order', () => {
    const r = readSource('merchant.txt', fixture('merchant.txt'), limits)
    expect(r.fileType).toBe('txt')
    expect(r.paragraphs).toHaveLength(5)
    expect(r.paragraphs[0]).toBe('كان في قديم الزمان تاجر يسافر بين المدن.')
    expect(r.paragraphs[4]).toBe('وهناك رأى رجلًا يبيع الكتب القديمة.')
  })

  it('strips a BOM, collapses inner whitespace and ignores repeated blank lines', () => {
    const text = '﻿  سطر   أول\nتكملة \n\n\n \t \nفقرة ثانية\n'
    expect(readSource('a.txt', Buffer.from(text), limits).paragraphs).toEqual(['سطر أول تكملة', 'فقرة ثانية'])
  })

  it('keeps a mixed Arabic/English paragraph as long as some Arabic exists', () => {
    expect(readSource('a.txt', Buffer.from('Chapter 1\n\nالفصل الأول'), limits).paragraphs).toEqual([
      'Chapter 1',
      'الفصل الأول',
    ])
  })

  it.each([
    ['notes.md', 415, 'unsupported_type'],
    ['noextension', 415, 'unsupported_type'],
    ['book.docx', 415, 'format_not_implemented'],
    ['scan.PDF', 415, 'format_not_implemented'],
  ])('rejects %s with %i %s', (name, status, code) => {
    const e = errorOf(() => readSource(name, Buffer.from('نص'), limits))
    expect([e.status, e.code]).toEqual([status, code])
  })

  it('rejects a file over the byte limit with 413', () => {
    expect(errorOf(() => readSource('a.txt', Buffer.alloc(10_001, 0x41), limits)).status).toBe(413)
  })

  it('rejects invalid UTF-8 with 422 invalid_encoding', () => {
    expect(errorOf(() => readSource('a.txt', Buffer.from([0xd8, 0x00, 0xff]), limits)).code).toBe('invalid_encoding')
  })

  it.each([
    ['empty file', '', 'empty'],
    ['whitespace only', ' \n\n \t\n', 'empty'],
    ['no Arabic letters', 'Only English here.\n\nStill English.', 'no_arabic_text'],
  ])('rejects %s with 422 %s', (_label, text, code) => {
    const e = errorOf(() => readSource('a.txt', Buffer.from(text), limits))
    expect([e.status, e.code]).toEqual([422, code])
  })

  it('rejects more paragraphs than the limit and reports the count', () => {
    const text = Array.from({ length: 6 }, (_, i) => `فقرة ${i}`).join('\n\n')
    const e = errorOf(() => readSource('a.txt', Buffer.from(text), limits))
    expect(e.code).toBe('over_limit')
    expect(e.details).toEqual({ paragraph_count: 6, limit: 5 })
  })
})
