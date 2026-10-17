// Diff-based frame renderer. A screen describes what it wants as a Frame;
// the renderer only pushes the containers that changed, serialised on one
// queue (image sends must never overlap, and ordered text updates keep the
// header/body/footer consistent).
import { ImageRawDataUpdate, TextContainerUpgrade, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { C, PHOTO } from './layout'

export interface Frame {
  header: string
  body: string
  detail: string
  footer: string
  /** Speaker ids whose photo should appear in photo1/photo2 (null = blank). */
  photos: [number | null, number | null]
}

export const emptyFrame = (): Frame => ({ header: ' ', body: ' ', detail: ' ', footer: ' ', photos: [null, null] })

const photoUrl = (id: number) => `${import.meta.env.BASE_URL}speakers/${id}.png`.replace(/\/\/+/g, '/')

export class Renderer {
  private last: Frame | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private cache = new Map<number, Promise<Uint8Array | null>>()
  private blank: Promise<Uint8Array> | null = null
  private shown: [number | null | 'blank', number | null | 'blank'] = [null, null]
  readonly frameListeners = new Set<(f: Frame) => void>()

  constructor(private bridge: EvenAppBridge) {}

  render(frame: Frame): Promise<void> {
    const prev = this.last
    this.last = frame
    this.frameListeners.forEach(l => l(frame))
    const run = async () => {
      const texts: Array<[keyof typeof C, string]> = [
        ['header', frame.header],
        ['body', frame.body],
        ['detail', frame.detail],
        ['footer', frame.footer],
      ]
      for (const [key, content] of texts) {
        if (prev && prev[key as 'header'] === content) continue
        await this.upgrade(C[key], content)
      }
      for (let i = 0; i < 2; i++) {
        const want = frame.photos[i]
        const slot = i === 0 ? C.photo1 : C.photo2
        const have = this.shown[i]
        if (want === have || (want === null && (have === 'blank' || have === null))) continue
        await this.pushPhoto(slot, want)
        this.shown[i] = want ?? 'blank'
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
    const bytes = speakerId === null ? await this.blankPng() : (await this.photo(speakerId)) ?? (await this.blankPng())
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
