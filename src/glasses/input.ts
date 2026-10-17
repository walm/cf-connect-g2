// Normalises the Even Hub event stream into a handful of app actions.
//
// Gotchas (from the official templates):
//  - CLICK_EVENT is 0 and protobuf drops zero fields, so a tap arrives with
//    eventType undefined. Resolve the default *inside* the envelope check.
//  - Taps / double-taps / lifecycle arrive on sysEvent; swipes on textEvent.
//  - Menu selections arrive on menuItemClickEvent regardless of capture.
import { OsEventTypeList, type EvenAppBridge, type EvenHubEvent } from '@evenrealities/even_hub_sdk'

export type Action = 'click' | 'double' | 'up' | 'down' | 'exit' | { menu: number }

function typeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

export function toAction(event: EvenHubEvent): Action | null {
  const menu = event.menuItemClickEvent?.itemID
  if (menu !== undefined) return { menu }
  const sys = typeOf(event.sysEvent)
  const text = typeOf(event.textEvent)
  const list = typeOf(event.listEvent)

  if (sys === OsEventTypeList.DOUBLE_CLICK_EVENT || text === OsEventTypeList.DOUBLE_CLICK_EVENT || list === OsEventTypeList.DOUBLE_CLICK_EVENT) return 'double'
  if (text === OsEventTypeList.SCROLL_TOP_EVENT || list === OsEventTypeList.SCROLL_TOP_EVENT) return 'up'
  if (text === OsEventTypeList.SCROLL_BOTTOM_EVENT || list === OsEventTypeList.SCROLL_BOTTOM_EVENT) return 'down'
  if (sys === OsEventTypeList.CLICK_EVENT || text === OsEventTypeList.CLICK_EVENT || list === OsEventTypeList.CLICK_EVENT) return 'click'
  if (sys === OsEventTypeList.SYSTEM_EXIT_EVENT || sys === OsEventTypeList.ABNORMAL_EXIT_EVENT) return 'exit'
  return null
}

export function bindInput(bridge: EvenAppBridge, handler: (a: Action) => void): () => void {
  let lastClick = 0
  return bridge.onEvenHubEvent(event => {
    const action = toAction(event)
    if (!action) return
    if (action === 'click') {
      // Some firmware builds echo a tap on two envelopes; collapse near-duplicates.
      const t = Date.now()
      if (t - lastClick < 120) return
      lastClick = t
    }
    handler(action)
  })
}
