// Phone-side UI (the WebView the Even App shows). Browse, search and star
// sessions with a touchscreen; everything syncs instantly with the glasses.
// Also mirrors the glasses frame and offers on-screen gesture buttons, which
// doubles as a handy test harness in the simulator.
import type { App } from './app'
import type { Frame } from './glasses/renderer'
import { eventNow, getTimeOverride, setTimeOverride } from './model/clock'
import { DAYS, EVENT_NAME, FETCHED_AT, SESSIONS, TRACKS, TYPES, VENUE, dayLabel, dayShort, statusOf, type Session } from './model/sessions'
import { stars } from './store'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const photoUrl = (id: number) => `${import.meta.env.BASE_URL}speakers/${id}.png`.replace(/\/\/+/g, '/')

const LOGO = `<svg class="logo" viewBox="0 0 68 48" fill="none" aria-hidden="true"><path d="M47 40.5c.6-2.2.4-4.2-.7-5.7-1-1.4-2.6-2.2-4.6-2.3l-37.5-.5c-.2 0-.4-.1-.5-.3-.1-.2-.2-.4-.1-.6.1-.4.5-.7.9-.7l37.9-.5c4.5-.2 9.4-3.9 11.1-8.3l2.2-5.6c.1-.2.1-.5.1-.7C53.2 6.4 44.3 0 33.9 0 24.4 0 16.3 6 13.3 14.5c-1.9-1.4-4.4-2.2-7-2-4.7.5-8.4 4.2-8.9 8.9-.1 1.2 0 2.4.2 3.5C-2 25.1-6.5 31.4-6.5 38.7" fill="#f6821f"/><path d="M54.7 17.4h-.8c-.3 0-.5.2-.6.4l-1.5 5.2c-.6 2.2-.4 4.2.7 5.7 1 1.4 2.6 2.2 4.6 2.3l8 .5c.2 0 .4.1.5.3.1.2.2.4.1.6-.1.4-.5.7-.9.7l-8.3.5c-4.5.2-9.4 3.9-11.1 8.3l-.6 1.6c-.1.3.1.6.4.6h28.6c.3 0 .6-.2.7-.5.5-1.8.8-3.6.8-5.6-.1-11.3-9.2-20.6-20.6-20.6z" fill="#fbad41"/></svg>`

export function mountCompanion() {
  const root = document.querySelector<HTMLDivElement>('#app')!
  let app: App | null = null
  let connected = false
  const state = { q: '', day: 'all' as string, track: '', type: '', open: new Set<number>() }

  root.innerHTML = `
    <header class="top">
      <div class="brand">${LOGO}<div><h1>${esc(EVENT_NAME)}</h1><small>${esc(VENUE)} · Oct 19–21</small></div></div>
      <span class="pill" id="status">connecting…</span>
    </header>
    <section class="glass" id="glass">
      <pre class="hdr" id="g-hdr"> </pre>
      <div class="bodywrap"><pre id="g-body"> </pre><div class="photos" id="g-photos"></div></div>
      <pre class="ftr" id="g-ftr"> </pre>
      <div class="scan"></div>
    </section>
    <div class="dpad">
      <button data-act="up">▲<small>swipe up</small></button>
      <button data-act="down">▼<small>swipe down</small></button>
      <button data-act="click">●<small>tap</small></button>
      <button data-act="double">●●<small>double-tap</small></button>
    </div>
    <div class="controls">
      <input class="search" id="q" type="search" placeholder="Search sessions, speakers, topics…" autocomplete="off" />
      <div class="seg" id="days"></div>
      <div class="selects">
        <select id="track"><option value="">All tracks</option>${TRACKS.map(t => `<option value="${esc(t.label)}">${esc(t.label)} (${t.count})</option>`).join('')}</select>
        <select id="type"><option value="">All types</option>${TYPES.map(t => `<option value="${esc(t.label)}">${esc(t.label)} (${t.count})</option>`).join('')}</select>
      </div>
    </div>
    <div class="count" id="count"></div>
    <div id="list"></div>
    <details class="dev">
      <summary>Developer</summary>
      <div class="row">
        <label for="now">Simulate event time</label>
        <select id="now">
          <option value="">Real time</option>
          ${DAYS.flatMap(d => ['08:15', '10:30', '13:00', '16:45'].map(t => `<option value="${d}T${t}">${dayLabel(d)} ${t}</option>`)).join('')}
          <option value="2026-10-22T09:00">After the event</option>
        </select>
      </div>
      <div class="row">Data fetched ${esc(new Date(FETCHED_AT).toLocaleString())} from cloudflare.com/connect/sessions · ${SESSIONS.length} sessions · refresh with <code>pnpm data</code></div>
    </details>
  `

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
  const statusEl = $('#status')
  const list = $('#list')
  const count = $('#count')
  const days = $('#days')

  const renderDays = () => {
    const tabs = [
      { id: 'all', label: 'All' },
      ...DAYS.map(d => ({ id: d, label: dayShort(d) })),
      { id: 'mine', label: `★ Mine (${stars.size})` },
    ]
    days.innerHTML = tabs.map(t => `<button data-day="${t.id}" class="${state.day === t.id ? 'on' : ''}">${t.label}</button>`).join('')
  }

  const matches = (s: Session) => {
    if (state.day === 'mine' && !stars.has(s.id)) return false
    if (state.day !== 'all' && state.day !== 'mine' && s.date !== state.day) return false
    if (state.track && s.track !== state.track) return false
    if (state.type && s.type !== state.type) return false
    if (state.q) {
      const hay = `${s.title} ${s.desc} ${s.track} ${s.type} ${s.topics.join(' ')} ${s.speakers.map(p => `${p.name} ${p.company}`).join(' ')}`.toLowerCase()
      if (!state.q.split(/\s+/).every(w => hay.includes(w))) return false
    }
    return true
  }

  const card = (s: Session, now = eventNow()) => {
    const st = statusOf(s, now)
    const starred = stars.has(s.id)
    const spk = s.speakers
      .map(p => `${p.photo ? `<img src="${photoUrl(p.id)}" alt="" loading="lazy" />` : `<i class="ph">${esc(p.name.split(' ').map(x => x[0]).join('').slice(0, 2))}</i>`}<span>${esc(p.name)}${p.company ? ` · ${esc(p.company)}` : ''}</span>`)
      .join('')
    return `<article class="card ${st} ${state.open.has(s.id) ? 'open' : ''}" data-id="${s.id}">
      <div class="time">${s.start}<small>${s.end}</small>${st === 'live' ? '<span class="live">● LIVE</span>' : ''}</div>
      <div>
        <h3>${esc(s.title)}</h3>
        <div class="meta"><b>${esc(s.track)}</b>${s.type ? ` · ${esc(s.type)}` : ''}${s.level ? ` · ${esc(s.level)}` : ''}${s.featured ? ' · Featured' : ''}</div>
        ${spk ? `<div class="spk">${spk}</div>` : ''}
      </div>
      <div class="actions">
        <button class="star ${starred ? 'on' : ''}" data-star="${s.id}" aria-label="star">${starred ? '★' : '☆'}</button>
        <button class="show" data-show="${s.id}">Show on glasses</button>
      </div>
      <div class="desc">${esc(s.desc || 'No description published yet.')}${s.topics.length ? `\n\nTopics: ${esc(s.topics.join(', '))}` : ''}</div>
    </article>`
  }

  const renderList = () => {
    const now = eventNow()
    const rows = SESSIONS.filter(matches)
    count.textContent = `${rows.length} session${rows.length === 1 ? '' : 's'}${state.day === 'mine' ? ' in my schedule' : ''}`
    if (!rows.length) {
      list.innerHTML = `<div class="empty">${state.day === 'mine' ? 'Nothing starred yet. Tap ☆ on a session to add it to your schedule.' : 'No sessions match.'}</div>`
      return
    }
    let last = ''
    let html = ''
    for (const s of rows) {
      if (s.date !== last) {
        last = s.date
        html += `<div class="daybar">${dayLabel(s.date).toUpperCase()}</div>`
      }
      html += card(s, now)
    }
    list.innerHTML = html
  }

  const renderAll = () => {
    renderDays()
    renderList()
  }

  const mirror = (f: Frame) => {
    $('#g-hdr').textContent = f.header
    $('#g-body').textContent = f.body
    $('#g-ftr').textContent = f.footer
    $('#g-photos').innerHTML = f.photos.filter((p): p is number => p !== null).map(p => `<img src="${photoUrl(p)}" alt="" />`).join('')
  }

  // Events
  $('#q').addEventListener('input', e => {
    state.q = (e.target as HTMLInputElement).value.trim().toLowerCase()
    renderList()
  })
  days.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-day]')
    if (!b) return
    state.day = b.dataset.day!
    renderAll()
  })
  $('#track').addEventListener('change', e => {
    state.track = (e.target as HTMLSelectElement).value
    renderList()
  })
  $('#type').addEventListener('change', e => {
    state.type = (e.target as HTMLSelectElement).value
    renderList()
  })
  list.addEventListener('click', e => {
    const t = e.target as HTMLElement
    const star = t.closest<HTMLElement>('[data-star]')
    if (star) {
      stars.toggle(Number(star.dataset.star))
      return
    }
    const show = t.closest<HTMLElement>('[data-show]')
    if (show) {
      app?.showSession(Number(show.dataset.show))
      show.textContent = 'On glasses ✓'
      setTimeout(() => (show.textContent = 'Show on glasses'), 1200)
      return
    }
    const c = t.closest<HTMLElement>('.card')
    if (c && !t.closest('img')) {
      const id = Number(c.dataset.id)
      state.open.has(id) ? state.open.delete(id) : state.open.add(id)
      c.classList.toggle('open')
    }
  })
  root.querySelector('.dpad')!.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
    if (b && app) app.onAction(b.dataset.act as 'up' | 'down' | 'click' | 'double')
  })
  const nowSel = $('#now') as HTMLSelectElement
  const q = new URLSearchParams(location.search).get('now')
  if (q) nowSel.value = q
  nowSel.addEventListener('change', () => {
    setTimeOverride(nowSel.value || null)
    renderAll()
  })

  stars.subscribe(renderAll)
  setInterval(() => {
    if (!getTimeOverride()) renderList()
  }, 60_000)
  renderAll()

  return {
    attach(a: App, bridgeConnected: boolean) {
      app = a
      connected = bridgeConnected
      statusEl.textContent = connected ? 'glasses linked' : 'preview (no glasses)'
      statusEl.classList.toggle('on', connected)
      a.frameListeners.add(mirror)
      if (a.lastFrame) mirror(a.lastFrame)
    },
  }
}
