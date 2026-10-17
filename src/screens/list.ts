import { emptyFrame, type Frame } from '../glasses/renderer'
import { BODY_INNER_W, BODY_LINES } from '../glasses/layout'
import { fitLine, rule } from '../glasses/text'
import type { Action } from '../glasses/input'
import { eventNow, type EventTime } from '../model/clock'
import { dayShort, statusOf, type Session } from '../model/sessions'
import { stars } from '../store'
import { CursorList, CURSOR, NO_CURSOR, type Nav, type Row, type Screen } from './screen'
import { DetailScreen } from './detail'

export interface ListOptions {
  title: string
  /** Called on every render so live filters (now & next, my schedule) stay fresh. */
  sessions: () => Session[]
  /** Where the cursor lands on first render. */
  startAt?: { kind: 'now' } | { kind: 'day'; date: string }
  emptyText?: string
  /** Show a day banner when the day changes (default true). */
  dayBanners?: boolean
}

export const mark = (s: Session, now: EventTime) => (stars.has(s.id) ? '★' : statusOf(s, now) === 'live' ? '●' : '·')

export class ListScreen implements Screen {
  readonly kind = 'list'
  private list = new CursorList([], BODY_LINES)
  private placed = false

  constructor(private opts: ListOptions) {}

  private buildRows(now: EventTime): Row[] {
    const rows: Row[] = []
    let lastDay = ''
    let nowMarkerDone = !now
    const sessions = this.opts.sessions()
    const todayHasSessions = sessions.some(s => s.date === now.date)
    for (const s of sessions) {
      if ((this.opts.dayBanners ?? true) && s.date !== lastDay) {
        lastDay = s.date
        rows.push({ text: rule('━', BODY_INNER_W - 60, dayShort(s.date)), selectable: false, key: `day:${s.date}` })
      }
      if (!nowMarkerDone && todayHasSessions && s.date === now.date && statusOf(s, now) === 'upcoming') {
        nowMarkerDone = true
        rows.push({ text: rule('─', BODY_INNER_W - 60, `now ${now.hhmm}`), selectable: false, key: 'now' })
      } else if (!nowMarkerDone && s.date > now.date) {
        nowMarkerDone = true
      }
      rows.push({
        text: `${mark(s, now)} ${s.start}  ${s.title}`,
        selectable: true,
        key: s.id,
        onSelect: nav => nav.push(new DetailScreen(s)),
      })
    }
    return rows
  }

  private place(now: EventTime) {
    const start = this.opts.startAt
    if (!start) return
    const sessions = this.opts.sessions()
    let target: Session | undefined
    if (start.kind === 'day') target = sessions.find(s => s.date === start.date)
    else {
      target = sessions.find(s => statusOf(s, now) !== 'past') ?? sessions[sessions.length - 1]
    }
    if (target) this.list.selectKey(target.id)
  }

  jumpToNow() {
    const now = eventNow()
    this.list.setRows(this.buildRows(now))
    this.place(now)
    this.opts.startAt = { kind: 'now' }
    this.placed = true
  }

  jumpDay(dir: 1 | -1) {
    const now = eventNow()
    const sessions = this.opts.sessions()
    const days = [...new Set(sessions.map(s => s.date))]
    const cur = this.currentSession()?.date ?? now.date
    const i = Math.min(Math.max(0, days.indexOf(cur) + dir), days.length - 1)
    const target = sessions.find(s => s.date === days[i])
    if (target) this.list.selectKey(target.id)
  }

  currentSession(): Session | undefined {
    const key = this.list.current()?.key
    return typeof key === 'number' ? this.opts.sessions().find(s => s.id === key) : undefined
  }

  render(): Frame {
    const now = eventNow()
    const keep = this.list.current()?.key
    this.list.setRows(this.buildRows(now), keep)
    if (!this.placed) {
      this.placed = true
      this.place(now)
    }
    const f = emptyFrame()
    const [pos, n] = this.list.position()
    const cur = this.currentSession()
    const where = cur ? dayShort(cur.date) : ''
    f.header = fitLine([this.opts.title, where, n ? `${pos}/${n}` : '', now.hhmm].filter(Boolean).join('  ·  '), BODY_INNER_W)
    if (!n) {
      f.body = this.opts.emptyText ?? 'Nothing here.'
      f.footer = 'double-tap: back'
      return f
    }
    f.body = this.list
      .visible()
      .map(({ row, selected }) => fitLine((row.selectable ? (selected ? CURSOR : NO_CURSOR) : '') + row.text, BODY_INNER_W))
      .join('\n')
    f.footer = 'tap: details  ·  swipe: move  ·  tap+hold: menu  ·  double-tap: back'
    return f
  }

  onAction(a: Action, nav: Nav) {
    if (a === 'up') this.list.move(-1)
    else if (a === 'down') this.list.move(1)
    else if (a === 'click') this.list.current()?.onSelect?.(nav)
  }
}
