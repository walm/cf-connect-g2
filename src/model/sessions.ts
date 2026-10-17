import raw from '../data/sessions.json'
import { eventNow, toMin, type EventTime } from './clock'

export interface Speaker {
  id: number
  name: string
  title: string
  company: string
  photo: boolean
}

export interface Session {
  id: number
  title: string
  desc: string
  date: string
  start: string
  end: string
  track: string
  type: string | null
  level: string | null
  topics: string[]
  areas: string[]
  industries: string[]
  featured: boolean
  speakers: Speaker[]
}

export const SESSIONS: Session[] = raw.sessions as Session[]
export const DAYS: string[] = raw.days
export const FETCHED_AT: string = raw.fetchedAt
export const EVENT_NAME = 'Cloudflare Connect 2026'
export const VENUE = 'Moscone West, San Francisco'

const byId = new Map(SESSIONS.map(s => [s.id, s]))
export const sessionById = (id: number) => byId.get(id)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'Tue Oct 20' */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** 'TUE 20' */
export function dayShort(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()].toUpperCase()} ${d.getUTCDate()}`
}

export const timeRange = (s: Session) => `${s.start}–${s.end}`

export type Status = 'past' | 'live' | 'upcoming'

export function statusOf(s: Session, now: EventTime = eventNow()): Status {
  if (s.date < now.date) return 'past'
  if (s.date > now.date) return 'upcoming'
  if (toMin(s.end) <= now.minutes) return 'past'
  if (toMin(s.start) <= now.minutes) return 'live'
  return 'upcoming'
}

/** Minutes from now until the session starts (negative when started). Crosses days. */
export function minutesUntil(s: Session, now: EventTime = eventNow()): number {
  const dayDiff = Math.round((Date.parse(`${s.date}T00:00Z`) - Date.parse(`${now.date}T00:00Z`)) / 86_400_000)
  return dayDiff * 1440 + toMin(s.start) - now.minutes
}

function countBy(key: (s: Session) => string | null) {
  const m = new Map<string, number>()
  for (const s of SESSIONS) {
    const k = key(s)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }))
}

export const TRACKS = countBy(s => s.track)
export const TYPES = countBy(s => s.type)

export const sessionsOn = (date: string) => SESSIONS.filter(s => s.date === date)

/** The event day that is "today", or the nearest upcoming day, or the last day once it's over. */
export function focusDay(now: EventTime = eventNow()): string {
  if (DAYS.includes(now.date)) return now.date
  return DAYS.find(d => d > now.date) ?? DAYS[DAYS.length - 1]
}

export function isEventDay(now: EventTime = eventNow()) {
  return DAYS.includes(now.date)
}

/** Live sessions plus everything starting in the next `horizon` minutes. */
export function nowAndNext(horizon = 90, now: EventTime = eventNow()): Session[] {
  const soon = SESSIONS.filter(s => {
    const st = statusOf(s, now)
    return st === 'live' || (st === 'upcoming' && minutesUntil(s, now) <= horizon)
  })
  if (soon.length) return soon
  // Nothing in the window: show the next slot that has anything at all.
  const upcoming = SESSIONS.filter(s => statusOf(s, now) === 'upcoming')
  if (!upcoming.length) return []
  const firstStart = upcoming[0].date + upcoming[0].start
  const slotEnd = minutesUntil(upcoming[0], now) + horizon
  return upcoming.filter(s => s.date + s.start === firstStart || minutesUntil(s, now) <= slotEnd)
}
