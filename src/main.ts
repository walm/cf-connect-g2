import { waitForEvenAppBridge, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { App } from './app'
import { mountCompanion } from './companion'
import { hiddenTracks, stars } from './store'

// Mount the phone UI first so the page is useful even while the bridge wakes
// up (or when opened in a desktop browser without the Even App).
const companion = mountCompanion()

const BRIDGE_TIMEOUT = 8000
const bridge: EvenAppBridge | null = await Promise.race([
  waitForEvenAppBridge(),
  new Promise<null>(resolve => setTimeout(() => resolve(null), BRIDGE_TIMEOUT)),
])
if (!bridge) console.warn('Even App bridge not found; running companion-only (browser preview mode).')

await Promise.all([stars.init(bridge), hiddenTracks.init(bridge)])
const app = new App(bridge)
companion.attach(app, bridge !== null)
await app.start()
