// Text fitting for the G2's single LVGL font. pretext ships the same glyph
// metrics as the firmware, so we can truncate rows to exactly one line and
// paginate long descriptions without guessing.
import { pxTruncate, measureTextWrap, getTextWidth } from '@evenrealities/pretext'

export const LINE_H = 27

export const fitLine = (text: string, widthPx: number) => pxTruncate(text.replace(/[\n\r\t]+/g, ' '), widthPx)

/** Run of spaces roughly as wide as `sample`, so unselected rows line up under the cursor glyph. */
export function spacesAsWideAs(sample: string): string {
  const target = getTextWidth(sample)
  let s = ''
  while (getTextWidth(s + ' ') <= target) s += ' '
  return s
}

/** Split text into pages of at most `maxLines` rendered lines at `widthPx`. */
export function paginate(source: string, widthPx: number, maxLines: number): string[] {
  const paragraphs = source.replace(/\r/g, '').split('\n')
  const pages: string[] = []
  let buffer: string[] = []
  let used = 0

  const flush = () => {
    while (buffer.length && buffer[buffer.length - 1] === '') buffer.pop()
    if (buffer.length) pages.push(buffer.join('\n'))
    buffer = []
    used = 0
  }
  const lines = (p: string) => (p === '' ? 1 : measureTextWrap(p, widthPx).lineCount)

  for (const para of paragraphs) {
    if (para === '' && used === 0) continue // never start a page with a blank line
    const n = lines(para)
    if (n > maxLines - used && used > 0) flush()
    if (para === '' && used === 0) continue
    if (n <= maxLines) {
      buffer.push(para)
      used += n
      continue
    }
    // Paragraph longer than a page: split on words.
    const words = para.split(/(\s+)/)
    let current = ''
    for (const w of words) {
      const cand = current + w
      if (measureTextWrap(cand, widthPx).lineCount > maxLines - used && current.trim()) {
        buffer.push(current.trim())
        flush()
        current = w.trimStart()
      } else current = cand
    }
    if (current.trim()) {
      buffer.push(current.trim())
      used += lines(current.trim())
    }
  }
  flush()
  return pages.length ? pages : ['']
}

/** Repeat `ch` until the line is about `widthPx` wide. */
export function rule(ch: string, widthPx: number, label = ''): string {
  const core = label ? `${ch}${ch} ${label} ` : ''
  let s = core
  while (measureTextWrap(s + ch, widthPx + 200).lineWidths[0] < widthPx) s += ch
  return s
}
