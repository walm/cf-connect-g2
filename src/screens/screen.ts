import type { Action } from '../glasses/input'
import type { Frame } from '../glasses/renderer'
import { spacesAsWideAs } from '../glasses/text'

export interface Nav {
  push(s: Screen): void
  pop(): void
  home(): void
  requestRender(): void
}

export interface Screen {
  readonly kind: string
  render(): Frame
  onAction(a: Action, nav: Nav): void
}

export interface Row {
  text: string
  selectable: boolean
  key?: string | number
  onSelect?: (nav: Nav) => void
}

/** Cursor + viewport logic shared by every list-like screen. */
export class CursorList {
  cursor = 0
  top = 0
  constructor(public rows: Row[], public lines: number) {}

  setRows(rows: Row[], keepKey?: string | number) {
    this.rows = rows
    if (keepKey !== undefined) {
      const i = rows.findIndex(r => r.key === keepKey)
      if (i >= 0) this.cursor = i
    }
    this.clampCursor()
    this.ensureVisible()
  }

  current(): Row | undefined {
    return this.rows[this.cursor]
  }

  selectKey(key: string | number) {
    const i = this.rows.findIndex(r => r.key === key)
    if (i >= 0) {
      this.cursor = i
      this.clampCursor()
      this.ensureVisible(true)
    }
  }

  move(dir: 1 | -1): boolean {
    let i = this.cursor
    do i += dir
    while (i >= 0 && i < this.rows.length && !this.rows[i].selectable)
    if (i < 0 || i >= this.rows.length) return false
    this.cursor = i
    this.ensureVisible()
    return true
  }

  private clampCursor() {
    if (!this.rows.length) {
      this.cursor = 0
      return
    }
    this.cursor = Math.min(Math.max(0, this.cursor), this.rows.length - 1)
    if (!this.rows[this.cursor].selectable) {
      const next = this.rows.findIndex((r, i) => i >= this.cursor && r.selectable)
      const prev = [...this.rows.keys()].reverse().find(i => i <= this.cursor && this.rows[i].selectable)
      this.cursor = next >= 0 ? next : prev ?? 0
    }
  }

  /** Keep the cursor on screen; when `center` show a bit of context above it. */
  ensureVisible(center = false) {
    const maxTop = Math.max(0, this.rows.length - this.lines)
    if (center) this.top = Math.min(maxTop, Math.max(0, this.cursor - 1))
    if (this.cursor < this.top) this.top = this.cursor
    if (this.cursor >= this.top + this.lines) this.top = this.cursor - this.lines + 1
    // Pull a leading non-selectable header into view when it's right above the cursor.
    if (this.top > 0 && this.cursor === this.top && !this.rows[this.top - 1].selectable) this.top--
    this.top = Math.min(Math.max(0, this.top), maxTop)
  }

  visible(): Array<{ row: Row; selected: boolean }> {
    return this.rows.slice(this.top, this.top + this.lines).map((row, i) => ({ row, selected: this.top + i === this.cursor }))
  }

  /** Index of the cursor among selectable rows, 1-based, plus the total. */
  position(): [number, number] {
    let n = 0
    let pos = 0
    this.rows.forEach((r, i) => {
      if (!r.selectable) return
      n++
      if (i === this.cursor) pos = n
    })
    return [pos, n]
  }
}

export const CURSOR = '▶ '
export const NO_CURSOR = spacesAsWideAs(CURSOR)
