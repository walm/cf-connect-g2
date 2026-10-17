import { emptyFrame, type Frame } from '../glasses/renderer'
import { BODY_INNER_W, BODY_LINES, DETAIL_INNER_W } from '../glasses/layout'
import { fitLine, paginate } from '../glasses/text'
import type { Action } from '../glasses/input'
import { eventNow } from '../model/clock'
import { dayLabel, dayShort, minutesUntil, statusOf, timeRange, type Session } from '../model/sessions'
import { stars } from '../store'
import type { Nav, Screen } from './screen'

export class DetailScreen implements Screen {
  readonly kind = 'detail'
  private page = 0
  private pages: string[] = []
  private pagesKey = ''

  constructor(readonly session: Session) {}

  private photos(): [number | null, number | null] {
    const ids = this.session.speakers.filter(p => p.photo).map(p => p.id)
    return [ids[0] ?? null, ids[1] ?? null]
  }

  private text(): string {
    const s = this.session
    const now = eventNow()
    const status = statusOf(s, now)
    const until = minutesUntil(s, now)
    const when =
      status === 'live'
        ? 'LIVE NOW'
        : status === 'past'
          ? 'ended'
          : until < 60
            ? `in ${until} min`
            : until < 1440
              ? `in ${Math.floor(until / 60)} h ${until % 60} min`
              : ''
    const meta = [dayLabel(s.date), timeRange(s), when].filter(Boolean).join(' · ')
    const kind = [s.type, s.level, s.featured ? 'Featured' : ''].filter(Boolean).join(' · ')
    const speakers = s.speakers.length
      ? s.speakers.map(p => `${p.name}${p.company ? `, ${p.company}` : ''}`).join('\n')
      : ''
    return [
      s.title,
      meta,
      `${s.track}${kind ? ` · ${kind}` : ''}`,
      stars.has(s.id) ? '★ In my schedule' : '☆ Not in my schedule',
      '',
      speakers,
      speakers ? '' : null,
      s.desc || 'No description published yet.',
      s.topics.length ? '' : null,
      s.topics.length ? `Topics: ${s.topics.join(', ')}` : null,
    ]
      .filter(x => x !== null)
      .join('\n')
  }

  toggleStar() {
    stars.toggle(this.session.id)
  }

  render(): Frame {
    const hasPhotos = this.photos()[0] !== null
    const width = hasPhotos ? DETAIL_INNER_W : BODY_INNER_W
    const text = this.text()
    const key = `${width}:${text}`
    if (key !== this.pagesKey) {
      this.pagesKey = key
      this.pages = paginate(text, width, BODY_LINES)
      this.page = Math.min(this.page, this.pages.length - 1)
    }
    const f = emptyFrame()
    const s = this.session
    f.header = fitLine(`SESSION  ·  ${dayShort(s.date)} ${s.start}  ·  page ${this.page + 1}/${this.pages.length}  ·  ${eventNow().hhmm}`, BODY_INNER_W)
    f.body = this.pages[this.page]
    if (hasPhotos) f.photos = this.photos()
    const starred = stars.has(s.id)
    f.footer = fitLine(`tap: ${starred ? 'remove from' : 'add to'} my schedule  ·  swipe: read  ·  double-tap: back`, BODY_INNER_W)
    return f
  }

  onAction(a: Action, _nav: Nav) {
    if (a === 'down') this.page = Math.min(this.page + 1, this.pages.length - 1)
    else if (a === 'up') this.page = Math.max(this.page - 1, 0)
    else if (a === 'click') this.toggleStar()
  }
}
