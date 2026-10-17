// Fixed container layout for the whole app. Everything is created once and
// then driven with textContainerUpgrade / updateImageRawData, which are
// flicker-free; rebuildPageContainer is never needed.
import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  MenuContainerProperty,
  MenuItemProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { LINE_H } from './text'

export const W = 576
export const H = 288
export const PAD = 4

export const HEADER_H = 30
export const BODY_Y = HEADER_H
export const BODY_H = 226
export const FOOTER_Y = BODY_Y + BODY_H + 2
export const FOOTER_H = H - FOOTER_Y

export const PHOTO = 112
export const PHOTO_X = W - PHOTO - 8
export const DETAIL_W = PHOTO_X - 8

export const BODY_LINES = Math.floor((BODY_H - 2 * PAD) / LINE_H) // 8
export const BODY_INNER_W = W - 2 * PAD
export const DETAIL_INNER_W = DETAIL_W - 2 * PAD
export const HEADER_INNER_W = W - 2 * PAD

export const C = {
  root: { id: 1, name: 'root' },
  header: { id: 2, name: 'header' },
  body: { id: 3, name: 'body' },
  detail: { id: 4, name: 'detail' },
  footer: { id: 5, name: 'footer' },
  photo1: { id: 6, name: 'photo1' },
  photo2: { id: 7, name: 'photo2' },
} as const

export const TEXT_BRIGHTNESS = { header: 3, body: 4, detail: 4, footer: 2 }

export interface MenuItem {
  itemID: number
  itemName: string
}

export function buildPage(menuItems: MenuItem[]): CreateStartUpPageContainer {
  const text = (c: { id: number; name: string }, box: [number, number, number, number], z: number, extra: Partial<TextContainerProperty> = {}) =>
    new TextContainerProperty({
      containerID: c.id,
      containerName: c.name,
      xPosition: box[0],
      yPosition: box[1],
      width: box[2],
      height: box[3],
      borderWidth: 0,
      borderColor: 0,
      paddingLength: PAD,
      content: ' ',
      isEventCapture: 0,
      zOrderIndex: z,
      ...extra,
    })

  return new CreateStartUpPageContainer({
    containerTotalNum: 7,
    textObject: [
      // Invisible full-screen layer that owns input. Images can't capture events.
      text(C.root, [0, 0, W, H], 1, { isEventCapture: 1, paddingLength: 0 }),
      text(C.header, [0, 0, W, HEADER_H], 2, { textColor: TEXT_BRIGHTNESS.header }),
      text(C.body, [0, BODY_Y, W, BODY_H], 3, { textColor: TEXT_BRIGHTNESS.body }),
      text(C.detail, [0, BODY_Y, DETAIL_W, BODY_H], 4, { textColor: TEXT_BRIGHTNESS.detail }),
      text(C.footer, [0, FOOTER_Y, W, FOOTER_H], 5, { textColor: TEXT_BRIGHTNESS.footer }),
    ],
    imageObject: [
      new ImageContainerProperty({ containerID: C.photo1.id, containerName: C.photo1.name, xPosition: PHOTO_X, yPosition: BODY_Y + 4, width: PHOTO, height: PHOTO, zOrderIndex: 6 }),
      new ImageContainerProperty({ containerID: C.photo2.id, containerName: C.photo2.name, xPosition: PHOTO_X, yPosition: BODY_Y + 4 + PHOTO + 6, width: PHOTO, height: PHOTO, zOrderIndex: 7 }),
    ],
    menuObject: new MenuContainerProperty({ menuItems: menuItems.map(m => new MenuItemProperty(m)) }),
  })
}
