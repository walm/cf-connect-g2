import { emptyFrame, type Frame } from '../glasses/renderer'
import { BODY_INNER_W, BODY_LINES } from '../glasses/layout'
import { fitLine } from '../glasses/text'
import type { Action } from '../glasses/input'
import { eventNow } from '../model/clock'
import { CursorList, CURSOR, NO_CURSOR, type Nav, type Row, type Screen } from './screen'

export interface PickerEntry {
  label: string
  hint?: string
  open: (nav: Nav) => void
}

/** A simple cursor menu: tracks, session types, home. */
export class PickerScreen implements Screen {
  readonly kind = 'picker'
  private list: CursorList

  constructor(
    private title: string,
    private entries: () => PickerEntry[],
    private footer = 'tap: open  ·  swipe: move  ·  double-tap: back',
    initialIndex = 0,
  ) {
    this.list = new CursorList(this.rows(), BODY_LINES)
    this.list.cursor = initialIndex
    this.list.ensureVisible()
  }

  private rows(): Row[] {
    return this.entries().map((e, i) => ({
      text: e.hint ? `${e.label}  ·  ${e.hint}` : e.label,
      selectable: true,
      key: i,
      onSelect: e.open,
    }))
  }

  render(): Frame {
    this.list.setRows(this.rows(), this.list.current()?.key)
    const f = emptyFrame()
    const [pos, n] = this.list.position()
    f.header = fitLine(`${this.title}  ·  ${pos}/${n}  ·  ${eventNow().hhmm}`, BODY_INNER_W)
    f.body = this.list
      .visible()
      .map(({ row, selected }) => fitLine((selected ? CURSOR : NO_CURSOR) + row.text, BODY_INNER_W))
      .join('\n')
    f.footer = this.footer
    return f
  }

  onAction(a: Action, nav: Nav) {
    if (a === 'up') this.list.move(-1)
    else if (a === 'down') this.list.move(1)
    else if (a === 'click') this.list.current()?.onSelect?.(nav)
  }
}
