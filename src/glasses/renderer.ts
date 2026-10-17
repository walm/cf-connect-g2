// Diff-based frame renderer. A screen describes what it wants as a Frame;
// the renderer pushes only the containers that changed, serialised on one
// queue (image sends must never overlap, and ordered text updates keep the
// header/body/footer consistent). Switching between the text and photo
// layouts is the only time the page is rebuilt.
import { ImageRawDataUpdate, TextContainerUpgrade, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { C, PHOTO, modeFor, rebuildPage, startupPage, type LayoutMode, type MenuItem } from './layout'

export interface Frame {
  header: string
  body: string
  footer: string
  /** Speaker ids whose photo should appear in photo1/photo2 (null = none). */
  photos: [number | null, number | null]
}

export const emptyFrame = (): Frame => ({ header: ' ', body: ' ', footer: ' ', photos: [null, null] })

const photoUrl = (id: number) => `${import.meta.env.BASE_URL}speakers/${id}.png`.replace(/\/\/+/g, '/')

export class Renderer {
  private last: Frame | null = null
  private mode: LayoutMode = 'text'
  private queue: Promise<unknown> = Promise.resolve()
  private cache = new Map<number, Promise<Uint8Array | null>>()
  private blank: Promise<Uint8Array> | null = null
  private shown: [number | null, number | null] = [null, null]

  constructor(
    private bridge: EvenAppBridge,
    private menuItems: MenuItem[],
  ) {}

  /** Create the startup page (text layout, empty). Must run before any render. */
  async init(): Promise<number> {
    const status = await this.bridge.createStartUpPageContainer(startupPage(this.menuItems, emptyFrame()))
    if (status !== 0) console.error('createStartUpPageContainer failed:', status)
    this.last = emptyFrame()
    return status
  }

  render(frame: Frame): Promise<void> {
    const run = async () => {
      const prev = this.last
      this.last = frame
      const mode = modeFor(frame)
      if (mode !== this.mode) {
        const ok = await this.bridge.rebuildPageContainer(rebuildPage(mode, this.menuItems, frame))
        if (!ok) console.warn('rebuildPageContainer returned false')
        this.mode = mode
        this.shown = [null, null]
      } else {
        const texts: Array<['header' | 'body' | 'footer', string]> = [
          ['header', frame.header],
          ['body', frame.body],
          ['footer', frame.footer],
        ]
        for (const [key, content] of texts) {
          if (prev && prev[key] === content) continue
          await this.upgrade(C[key], content)
        }
      }
      if (mode === 'photo') {
        for (let i = 0; i < 2; i++) {
          const want = frame.photos[i]
          if (want === this.shown[i]) continue
          await this.pushPhoto(i === 0 ? C.photo1 : C.photo2, want)
          this.shown[i] = want
        }
      }
    }
    this.queue = this.queue.then(run, run).catch(e => console.error('render failed', e))
    return this.queue as Promise<void>
  }

  private async upgrade(c: { id: number; name: string }, content: string) {
    const ok = await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: c.id, containerName: c.name, content: content || ' ' }),
    )
    if (!ok) console.warn(`textContainerUpgrade(${c.name}) returned false`)
  }

  private async pushPhoto(slot: { id: number; name: string }, speakerId: number | null) {
    const bytes = speakerId === null ? await this.blankPng() : ((await this.photo(speakerId)) ?? (await this.blankPng()))
    const result = await this.bridge.updateImageRawData(
      new ImageRawDataUpdate({ containerID: slot.id, containerName: slot.name, imageData: bytes }),
    )
    if (result !== 'success') console.warn(`updateImageRawData(${slot.name}) -> ${result}`)
  }

  private photo(id: number): Promise<Uint8Array | null> {
    let p = this.cache.get(id)
    if (!p) {
      p = fetch(photoUrl(id))
        .then(async r => (r.ok ? new Uint8Array(await r.arrayBuffer()) : null))
        .catch(e => {
          console.warn('photo fetch failed', id, e)
          return null
        })
      this.cache.set(id, p)
    }
    return p
  }

  /** All-black PNG = all pixels off on the glasses. */
  private blankPng(): Promise<Uint8Array> {
    if (!this.blank) {
      this.blank = new Promise<Uint8Array>((resolve, reject) => {
        const canvas = document.createElement('canvas')
        canvas.width = PHOTO
        canvas.height = PHOTO
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no 2d context'))
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, PHOTO, PHOTO)
        canvas.toBlob(async b => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('toBlob failed'))), 'image/png')
      })
    }
    return this.blank
  }
}
