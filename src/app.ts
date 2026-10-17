// Navigation stack + glue between the glasses renderer, input and screens.
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { MenuItem } from './glasses/layout'
import { bindInput, type Action } from './glasses/input'
import { Renderer, type Frame } from './glasses/renderer'
import { onClockChange } from './model/clock'
import { sessionById } from './model/sessions'
import { hiddenTracks, stars } from './store'
import { DetailScreen } from './screens/detail'
import { homeScreen, myScheduleScreen, nowScreen, scheduleScreen } from './screens/home'
import { ListScreen } from './screens/list'
import type { Nav, Screen } from './screens/screen'

// Context menu (tap + hold on the temple). Same menu on every screen so we
// never need a page rebuild.
const MENU = {
  home: 1,
  now: 2,
  jumpNow: 3,
  mine: 4,
  star: 5,
  nextDay: 6,
  prevDay: 7,
} as const

export const MENU_ITEMS: MenuItem[] = [
  { itemID: MENU.now, itemName: 'Now & next' },
  { itemID: MENU.star, itemName: 'Star / unstar' },
  { itemID: MENU.jumpNow, itemName: 'Jump to now' },
  { itemID: MENU.nextDay, itemName: 'Next day' },
  { itemID: MENU.prevDay, itemName: 'Previous day' },
  { itemID: MENU.mine, itemName: 'My schedule' },
  { itemID: MENU.home, itemName: 'Home' },
]

export class App implements Nav {
  private stack: Screen[] = []
  private renderer: Renderer | null = null
  private pending = false
  private unbind: (() => void) | null = null
  private ticker: ReturnType<typeof setInterval> | null = null
  readonly frameListeners = new Set<(f: Frame) => void>()
  lastFrame: Frame | null = null

  constructor(private bridge: EvenAppBridge | null) {}

  get top(): Screen {
    return this.stack[this.stack.length - 1]
  }
  get depth() {
    return this.stack.length
  }

  async start() {
    this.stack = [homeScreen()]
    if (this.bridge) {
      this.renderer = new Renderer(this.bridge, MENU_ITEMS)
      await this.renderer.init()
      this.unbind = bindInput(this.bridge, a => this.onAction(a))
    }
    stars.subscribe(() => this.requestRender())
    hiddenTracks.subscribe(() => this.requestRender())
    onClockChange(() => {
      // Time travel: rebuild the home screen so "today" moves with the clock.
      this.stack = [homeScreen()]
      this.requestRender()
    })
    // Live refresh: header clock, NOW marker, live dots.
    this.ticker = setInterval(() => this.requestRender(), 20_000)
    this.requestRender()
  }

  push(s: Screen) {
    this.stack.push(s)
    this.requestRender()
  }
  pop() {
    if (this.stack.length > 1) this.stack.pop()
    this.requestRender()
  }
  home() {
    this.stack = [homeScreen()]
    this.requestRender()
  }

  /** Companion page: open a session on the glasses. */
  showSession(id: number) {
    const s = sessionById(id)
    if (!s) return
    if (this.top instanceof DetailScreen && this.top.session.id === id) return
    this.push(new DetailScreen(s))
  }

  requestRender() {
    if (this.pending) return
    this.pending = true
    queueMicrotask(() => {
      this.pending = false
      let frame: Frame
      try {
        frame = this.top.render()
      } catch (e) {
        console.error('render error', e)
        return
      }
      this.lastFrame = frame
      this.frameListeners.forEach(l => l(frame))
      void this.renderer?.render(frame)
    })
  }

  onAction(a: Action) {
    if (a === 'exit') {
      this.cleanup()
      return
    }
    if (a === 'double') {
      if (this.stack.length > 1) this.pop()
      else void this.bridge?.shutDownPageContainer(1)
      return
    }
    if (typeof a === 'object') {
      this.onMenu(a.menu)
      return
    }
    this.top.onAction(a, this)
    this.requestRender()
  }

  private onMenu(id: number) {
    const top = this.top
    switch (id) {
      case MENU.home:
        this.home()
        break
      case MENU.now:
        this.push(nowScreen())
        break
      case MENU.mine:
        this.push(myScheduleScreen())
        break
      case MENU.jumpNow:
        if (top instanceof ListScreen) top.jumpToNow()
        else this.push(scheduleScreen())
        break
      case MENU.nextDay:
      case MENU.prevDay:
        if (top instanceof ListScreen) top.jumpDay(id === MENU.nextDay ? 1 : -1)
        else this.push(scheduleScreen())
        break
      case MENU.star: {
        const s = top instanceof DetailScreen ? top.session : top instanceof ListScreen ? top.currentSession() : undefined
        if (s) stars.toggle(s.id)
        break
      }
    }
    this.requestRender()
  }

  private cleanup() {
    this.unbind?.()
    this.unbind = null
    if (this.ticker) clearInterval(this.ticker)
    this.ticker = null
  }
}
