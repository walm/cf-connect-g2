// "My schedule": the set of starred session ids. Persisted through the Even
// App bridge storage (survives on the phone) and mirrored to localStorage so
// the companion page and the simulator keep it between reloads.
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

const KEY = 'cfconnect2026.starred.v1'

class StarStore {
  private ids = new Set<number>()
  private listeners = new Set<() => void>()
  private bridge: EvenAppBridge | null = null

  async init(bridge: EvenAppBridge | null) {
    this.bridge = bridge
    let json: string | null = null
    try {
      json = bridge ? await bridge.getLocalStorage(KEY) : null
    } catch (e) {
      console.warn('bridge storage unavailable', e)
    }
    if (!json) {
      try {
        json = localStorage.getItem(KEY)
      } catch {
        json = null
      }
    }
    if (json) {
      try {
        const arr = JSON.parse(json)
        if (Array.isArray(arr)) this.ids = new Set(arr.map(Number).filter(Number.isFinite))
      } catch (e) {
        console.warn('corrupt starred list, resetting', e)
      }
    }
    this.emit()
  }

  has = (id: number) => this.ids.has(id)
  get size() {
    return this.ids.size
  }
  all(): number[] {
    return [...this.ids]
  }

  toggle(id: number): boolean {
    if (this.ids.has(id)) this.ids.delete(id)
    else this.ids.add(id)
    void this.persist()
    this.emit()
    return this.ids.has(id)
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
      localStorage.setItem(KEY, json)
    } catch {
      /* private mode etc. */
    }
    if (this.bridge) {
      try {
        await this.bridge.setLocalStorage(KEY, json)
      } catch (e) {
        console.warn('bridge setLocalStorage failed', e)
      }
    }
  }
}

export const stars = new StarStore()
