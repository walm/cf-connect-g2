// Container layout. Two layouts share the same ids/names so text updates stay
// flicker-free within a layout; switching between them (a detail page with
// speaker photos vs. everything else) is the one place a page rebuild is used,
// because image containers can't be resized/removed in place and a blank image
// still occludes whatever sits under it.
import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  MenuContainerProperty,
  MenuItemProperty,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'
import { LINE_H } from './text'
import type { Frame } from './renderer'

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

export const C = {
  root: { id: 1, name: 'root' },
  header: { id: 2, name: 'header' },
  body: { id: 3, name: 'body' },
  footer: { id: 5, name: 'footer' },
  photo1: { id: 6, name: 'photo1' },
  photo2: { id: 7, name: 'photo2' },
} as const

export const TEXT_BRIGHTNESS = { header: 3, body: 4, footer: 2 }

export type LayoutMode = 'text' | 'photo'
export const modeFor = (f: Frame): LayoutMode => (f.photos[0] !== null ? 'photo' : 'text')

export interface MenuItem {
  itemID: number
  itemName: string
}

function spec(mode: LayoutMode, menuItems: MenuItem[], frame: Frame) {
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
  const bodyW = mode === 'photo' ? DETAIL_W : W
  const textObject = [
    // Invisible full-screen layer that owns input. Images can't capture events.
    text(C.root, [0, 0, W, H], 1, { isEventCapture: 1, paddingLength: 0 }),
    text(C.header, [0, 0, W, HEADER_H], 2, { textColor: TEXT_BRIGHTNESS.header, content: frame.header || ' ' }),
    text(C.body, [0, BODY_Y, bodyW, BODY_H], 3, { textColor: TEXT_BRIGHTNESS.body, content: frame.body || ' ' }),
    text(C.footer, [0, FOOTER_Y, W, FOOTER_H], 4, { textColor: TEXT_BRIGHTNESS.footer, content: frame.footer || ' ' }),
  ]
  const imageObject =
    mode === 'photo'
      ? [
          new ImageContainerProperty({ containerID: C.photo1.id, containerName: C.photo1.name, xPosition: PHOTO_X, yPosition: BODY_Y + 4, width: PHOTO, height: PHOTO, zOrderIndex: 5 }),
          new ImageContainerProperty({ containerID: C.photo2.id, containerName: C.photo2.name, xPosition: PHOTO_X, yPosition: BODY_Y + 4 + PHOTO + 6, width: PHOTO, height: PHOTO, zOrderIndex: 6 }),
        ]
      : []
  return {
    containerTotalNum: textObject.length + imageObject.length,
    textObject,
    imageObject,
    menuObject: new MenuContainerProperty({ menuItems: menuItems.map(m => new MenuItemProperty(m)) }),
  }
}

export const startupPage = (menuItems: MenuItem[], frame: Frame) => new CreateStartUpPageContainer(spec('text', menuItems, frame))
export const rebuildPage = (mode: LayoutMode, menuItems: MenuItem[], frame: Frame) => new RebuildPageContainer(spec(mode, menuItems, frame))
