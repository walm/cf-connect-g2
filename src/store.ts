// Small persisted sets: "My schedule" (starred session ids) and hidden tracks.
// Persisted through the Even App bridge storage (survives on the phone) and
// mirrored to localStorage so the companion page and the simulator keep them
// between reloads.
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

class PersistedSet<T extends string | number> {
  private items: Set<T>
  private listeners = new Set<() => void>()
  private bridge: EvenAppBridge | null = null

  constructor(
    private key: string,
    private parse: (v: unknown) => T | null,
    defaults: T[] = [],
  ) {
    this.items = new Set(defaults)
  }

  async init(bridge: EvenAppBridge | null) {
    this.bridge = bridge
    let json: string | null = null
    try {
      json = bridge ? await bridge.getLocalStorage(this.key) : null
    } catch (e) {
      console.warn('bridge storage unavailable', e)
    }
    if (!json) {
      try {
        json = localStorage.getItem(this.key)
      } catch {
        json = null
      }
    }
    if (json) {
      try {
        const arr = JSON.parse(json)
        if (Array.isArray(arr)) this.items = new Set(arr.map(this.parse).filter((v): v is T => v !== null))
      } catch (e) {
        console.warn(`corrupt ${this.key}, keeping defaults`, e)
      }
    }
    this.emit()
  }

  has = (v: T) => this.items.has(v)
  get size() {
    return this.items.size
  }
  all(): T[] {
    return [...this.items]
  }

  toggle(v: T): boolean {
    if (this.items.has(v)) this.items.delete(v)
    else this.items.add(v)
    void this.persist()
    this.emit()
    return this.items.has(v)
  }

  subscribe(l: () => void) {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  private emit() {
    this.listeners.forEach(l => l())
  }

  private async persist() {
    const json = JSON.stringify(this.all())
    try {
      localStorage.setItem(this.key, json)
    } catch {
      /* private mode etc. */
    }
    if (this.bridge) {
      try {
        await this.bridge.setLocalStorage(this.key, json)
      } catch (e) {
        console.warn('bridge setLocalStorage failed', e)
      }
    }
  }
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null)
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

/** Starred session ids ("My schedule"). */
export const stars = new PersistedSet<number>('cfconnect2026.starred.v1', num)

/** Tracks hidden from every list except My schedule. Partner / training tracks are hidden by default. */
export const hiddenTracks = new PersistedSet<string>('cfconnect2026.hiddenTracks.v1', str, [
  'Cloudflare University',
  'Global Partner Summit',
])
