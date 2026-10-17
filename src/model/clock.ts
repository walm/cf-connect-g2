// Event-local time (Moscone West is on Pacific time). Everything in the app
// reasons in "event time" so the schedule stays correct no matter where the
// phone thinks it is. A dev override (?now=2026-10-20T10:05 or the companion
// "simulate time" control) makes the live views testable before the event.
export const TZ = 'America/Los_Angeles'

export interface EventTime {
  date: string // YYYY-MM-DD
  minutes: number // minutes since midnight
  hhmm: string
}

let override: EventTime | null = null
const listeners = new Set<() => void>()

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function fromMin(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function parseEventTime(iso: string): EventTime | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(iso)
  if (!m) return null
  const minutes = Number(m[2]) * 60 + Number(m[3])
  return { date: m[1], minutes, hhmm: fromMin(minutes) }
}

export function setTimeOverride(iso: string | null) {
  override = iso ? parseEventTime(iso) : null
  listeners.forEach(l => l())
}

export function getTimeOverride(): EventTime | null {
  return override
}

export function onClockChange(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function eventNow(): EventTime {
  if (override) return override
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]))
  const hour = Number(p.hour) % 24
  const minutes = hour * 60 + Number(p.minute)
  return { date: `${p.year}-${p.month}-${p.day}`, minutes, hhmm: fromMin(minutes) }
}

// Honour ?now= on first load so the simulator can be launched at any moment of the event.
const q = new URLSearchParams(location.search).get('now')
if (q) override = parseEventTime(q)
