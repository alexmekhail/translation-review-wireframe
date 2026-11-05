import { AppError } from '../domain/errors.js'
import type { SourceFileType } from '../domain/types.js'

export interface ReadResult {
  fileType: SourceFileType
  paragraphs: string[]
}

export interface ReaderLimits {
  maxBytes: number
  maxParagraphs: number
}

const ARABIC_LETTER = /[؀-ۿݐ-ݿࢠ-ࣿ]/

/**
 * Turns an uploaded file into ordered Arabic paragraphs.
 * Implemented: UTF-8 .txt, paragraphs separated by one or more blank lines.
 * Not implemented: .docx and .pdf parsing (415 format_not_implemented); see docs/decisions.md D2.
 */
export function readSource(fileName: string, data: Buffer, limits: ReaderLimits): ReadResult {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (ext === 'docx' || ext === 'pdf') {
    throw new AppError(415, 'format_not_implemented', `.${ext} parsing is not implemented yet. Upload a UTF-8 .txt file.`)
  }
  if (ext !== 'txt' || !fileName.includes('.')) {
    throw new AppError(415, 'unsupported_type', 'Unsupported file type. Upload a .docx, PDF or .txt file.')
  }
  if (data.length > limits.maxBytes) {
    throw new AppError(413, 'file_too_large', `File is larger than ${limits.maxBytes} bytes.`)
  }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    throw new AppError(422, 'invalid_encoding', 'The file is not valid UTF-8 text.')
  }

  const paragraphs = text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0)

  if (paragraphs.length === 0) throw new AppError(422, 'empty', 'The file has no text.')
  if (!paragraphs.some((p) => ARABIC_LETTER.test(p))) {
    throw new AppError(422, 'no_arabic_text', 'No Arabic text was found in the file.')
  }
  if (paragraphs.length > limits.maxParagraphs) {
    throw new AppError(422, 'over_limit', `The file has ${paragraphs.length} paragraphs; the limit is ${limits.maxParagraphs}.`, {
      paragraph_count: paragraphs.length,
      limit: limits.maxParagraphs,
    })
  }
  return { fileType: 'txt', paragraphs }
}
