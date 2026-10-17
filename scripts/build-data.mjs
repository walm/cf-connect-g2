// Fetches the public Cloudflare Connect 2026 session catalogue and turns it
// into the compact JSON + greyscale speaker photos the glasses app ships with.
//
//   pnpm data            -> refresh src/data/sessions.json + public/speakers/*.png
//   pnpm data --no-photos -> skip photo download/conversion
//
// The sessions page is an Astro site that embeds the Swoogo catalogue as
// island props, so no API key is needed.
import { writeFile, mkdir, readFile, stat } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_URL = 'https://www.cloudflare.com/connect/sessions/'
const PHOTO_SIZE = 112
const withPhotos = !process.argv.includes('--no-photos')
const localHtml = process.argv.find(a => a.startsWith('--html='))?.slice(7)

const decodeEntities = s =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

// Astro serialises island props as [kind, value] tuples: 0 = plain, 1 = array.
const devalue = v => {
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') {
    const [t, x] = v
    if (t === 0) return x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).map(([k, val]) => [k, devalue(val)])) : x
    if (t === 1) return x.map(devalue)
    return devalue(x)
  }
  return v
}

const stripHtml = html =>
  decodeEntities(String(html ?? ''))
    .replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const values = field => (Array.isArray(field) ? field : field ? [field] : []).map(f => f?.value).filter(Boolean)
const hhmm = t => (t ? String(t).slice(0, 5) : null)

async function loadHtml() {
  if (localHtml) return readFile(localHtml, 'utf8')
  const res = await fetch(SOURCE_URL, { headers: { 'user-agent': 'Mozilla/5.0 (connect-g2 data builder)' } })
  if (!res.ok) throw new Error(`fetch ${SOURCE_URL}: ${res.status}`)
  return res.text()
}

function extractSessions(html) {
  const props = [...html.matchAll(/<astro-island[^>]*?props="([^"]*)"/g)].map(m => m[1])
  const big = props.sort((a, b) => b.length - a.length)[0]
  if (!big) throw new Error('no astro-island props found; page layout changed?')
  const raw = JSON.parse(decodeEntities(big))
  const data = devalue(raw.sessionsData)
  if (!Array.isArray(data)) throw new Error('sessionsData missing')
  return data
}

function normalise(raw) {
  return raw
    .filter(s => s.c_101342?.value === 'Yes' && s.track && !/invite only/i.test(s.track) && s.date && s.start_time)
    .map(s => ({
      id: s.id,
      title: decodeEntities(s.name).trim(),
      desc: stripHtml(s.description),
      date: s.date,
      start: hhmm(s.start_time),
      end: hhmm(s.end_time),
      track: s.track,
      type: s.type_id?.value ?? null,
      level: values(s.c_101001)[0]?.replace(/\s*\(.*\)/, '') ?? null,
      topics: values(s.c_103076),
      areas: values(s.c_102895),
      industries: values(s.c_101003),
      featured: values(s.c_102013).includes('Featured'),
      speakers: (s.speakers ?? []).map(p => ({
        id: Number(p.id),
        name: decodeEntities(p.name ?? `${p.first_name} ${p.last_name}`).trim(),
        title: decodeEntities(p.title ?? '').trim(),
        company: decodeEntities(p.company ?? '').trim(),
        photo: p.profile_picture || null,
      })),
    }))
    .sort((a, b) => (a.date + a.start + a.title).localeCompare(b.date + b.start + b.title))
}

async function exists(p) {
  try { await stat(p); return true } catch { return false }
}

async function buildPhotos(sessions) {
  const dir = resolve(ROOT, 'public/speakers')
  await mkdir(dir, { recursive: true })
  const speakers = new Map()
  for (const s of sessions) for (const p of s.speakers) if (p.photo) speakers.set(p.id, p.photo)
  const jobs = [...speakers.entries()]
  let done = 0, failed = 0
  const worker = async () => {
    for (;;) {
      const job = jobs.shift()
      if (!job) return
      const [id, url] = job
      const out = resolve(dir, `${id}.png`)
      if (await exists(out)) { done++; continue }
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        const buf = Buffer.from(await res.arrayBuffer())
        // Greyscale, contrast-stretched, square crop. The G2 panel is 16 shades
        // of green, so the SDK's grey4 conversion needs clear tonal separation.
        await sharp(buf)
          .rotate()
          .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'cover', position: 'attention' })
          .greyscale()
          .normalise({ lower: 2, upper: 98 })
          .linear(1.15, -12)
          .sharpen({ sigma: 0.8 })
          .toColourspace('b-w')
          .png({ compressionLevel: 9, palette: true, colours: 16, dither: 0.6 })
          .toFile(out)
        done++
      } catch (e) {
        failed++
        console.warn(`photo ${id} failed: ${e.message}`)
        for (const s of sessions) for (const p of s.speakers) if (p.id === id) p.photo = null
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  console.log(`photos: ${done} ok, ${failed} failed`)
}

const html = await loadHtml()
const sessions = normalise(extractSessions(html))
if (withPhotos) await buildPhotos(sessions)
for (const s of sessions) for (const p of s.speakers) p.photo = p.photo ? true : false

const days = [...new Set(sessions.map(s => s.date))].sort()
const out = { source: SOURCE_URL, fetchedAt: new Date().toISOString(), timezone: 'America/Los_Angeles', days, sessions }
await writeFile(resolve(ROOT, 'src/data/sessions.json'), JSON.stringify(out))
console.log(`sessions: ${sessions.length} across ${days.join(', ')}`)
console.log(`tracks: ${[...new Set(sessions.map(s => s.track))].join(' | ')}`)
console.log(`types: ${[...new Set(sessions.map(s => s.type))].join(' | ')}`)
