import { eventNow } from '../model/clock'
import { DAYS, EVENT_NAME, SESSIONS, TRACKS, TYPES, dayLabel, dayShort, focusDay, isEventDay, nowAndNext, sessionsOn, statusOf, visibleSessions } from '../model/sessions'
import { hiddenTracks, stars } from '../store'
import { spacesAsWideAs } from '../glasses/text'

const NO_MARK = spacesAsWideAs('●')
import { ListScreen } from './list'
import { PickerScreen, type PickerEntry } from './picker'
import type { Nav, Screen } from './screen'

export const scheduleScreen = (date?: string) =>
  new ListScreen({
    title: 'SCHEDULE',
    sessions: visibleSessions,
    startAt: date ? { kind: 'day', date } : { kind: 'now' },
  })

export const nowScreen = () =>
  new ListScreen({
    title: 'NOW & NEXT',
    sessions: () => nowAndNext(),
    startAt: { kind: 'now' },
    emptyText: 'Connect 2026 has wrapped up.\nThanks for coming!',
  })

export const myScheduleScreen = () =>
  new ListScreen({
    title: 'MY SCHEDULE',
    sessions: () => SESSIONS.filter(s => stars.has(s.id)),
    startAt: { kind: 'now' },
    emptyText: 'No sessions starred yet.\n\nOpen any session and tap to add it,\nor star sessions in the phone app.',
  })

export const featuredScreen = () =>
  new ListScreen({
    title: 'FEATURED',
    sessions: () => visibleSessions().filter(s => s.featured),
    startAt: { kind: 'now' },
  })

const filteredScreen = (title: string, pred: (s: typeof SESSIONS[number]) => boolean) =>
  new ListScreen({ title: title.toUpperCase(), sessions: () => SESSIONS.filter(pred), startAt: { kind: 'now' } })

// Browsing by track always lets you open a track, hidden or not.
export const tracksScreen = () =>
  new PickerScreen('TRACKS', () =>
    TRACKS.map(t => ({
      label: t.label,
      hint: `(${t.count})${hiddenTracks.has(t.label) ? '  ·  hidden' : ''}`,
      open: (nav: Nav) => nav.push(filteredScreen(t.label, s => s.track === t.label)),
    })),
  )

export const typesScreen = () =>
  new PickerScreen('SESSION TYPES', () =>
    TYPES.map(t => ({ label: t.label, hint: `(${t.count})`, open: (nav: Nav) => nav.push(filteredScreen(t.label, s => s.type === t.label)) })),
  )

/** Toggle list: tap a track to hide it from (or show it in) every schedule list.
 *  The glasses font has no checkbox glyphs, so ● marks a hidden track. */
export const hideTracksScreen = () =>
  new PickerScreen(
    'HIDE TRACKS',
    () =>
      TRACKS.map(t => ({
        label: `${hiddenTracks.has(t.label) ? '●' : NO_MARK} ${t.label}`,
        hint: `(${t.count})${hiddenTracks.has(t.label) ? '  ·  hidden' : ''}`,
        open: () => {
          hiddenTracks.toggle(t.label)
        },
      })),
    'tap: hide / show  ·  ● = hidden  ·  double-tap: back',
  )

export function homeScreen(): Screen {
  const now = eventNow()
  const today = focusDay(now)
  const entries = (): PickerEntry[] => {
    const n = eventNow()
    const pool = visibleSessions()
    const live = pool.filter(s => statusOf(s, n) === 'live').length
    const hidden = hiddenTracks.size
    const items: PickerEntry[] = [
      {
        label: 'Now & next',
        hint: live ? `● ${live} live` : isEventDay(n) ? 'coming up' : `starts ${dayLabel(DAYS[0])}`,
        open: nav => nav.push(nowScreen()),
      },
      ...DAYS.map(d => ({
        label: dayLabel(d),
        hint: `${sessionsOn(d).length} sessions${d === n.date ? '  ◀ today' : ''}`,
        open: (nav: Nav) => nav.push(scheduleScreen(d)),
      })),
      { label: 'My schedule', hint: `★ ${stars.size}`, open: nav => nav.push(myScheduleScreen()) },
      { label: 'Featured', hint: `(${pool.filter(s => s.featured).length})`, open: nav => nav.push(featuredScreen()) },
      { label: 'Browse by track', open: nav => nav.push(tracksScreen()) },
      { label: 'Browse by type', open: nav => nav.push(typesScreen()) },
      {
        label: 'Hide tracks',
        hint: hidden ? `${hidden} hidden  ·  ${SESSIONS.length - pool.length} sessions` : 'none hidden',
        open: nav => nav.push(hideTracksScreen()),
      },
    ]
    return items
  }
  const initial = isEventDay(now) ? 0 : 1 + Math.max(0, DAYS.indexOf(today))
  return new PickerScreen(
    `${EVENT_NAME.toUpperCase()}  ·  ${dayShort(today)}`,
    entries,
    'tap: open  ·  swipe: move  ·  tap+hold: menu  ·  double-tap: exit',
    initial,
  )
}
