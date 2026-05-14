/**
 * @metafor/ui — UI primitives поверх @metafor/engine.
 *
 * Card-system с гарантиями containment + immediate-mode flex helpers
 * + widget-функции (button/badge/input/divider) + theme-palette.
 *
 * Пример:
 *   import {Card, UiCanvas, flexRow, button, palette} from "@metafor/ui"
 *
 *   const ui = await UiCanvas.create(canvas)
 *   class MyCard extends Card {
 *     protected render() {
 *       flexRow({x: 14, y: 12, w: this.rectW - 28, h: 22, gap: 8, items: [
 *         {width: 100, height: 13, draw: (x, y) =>
 *           this.drawText("Hello", x, y, {fontPx: 13, material: this.materials.cyan})},
 *         {width: "grow", height: 0, draw: () => {}},
 *         {width: 60, height: 26, draw: (x, y, w, h) =>
 *           button(this, x, y, w, h, {label: "OK", action: () => alert("hi")})},
 *       ]})
 *     }
 *   }
 *   ui.addCard(new MyCard(), ({w}) => ({x: 0, y: 0, w, h: 200}))
 */

export * from "./canvas.ts"
export * from "./card.ts"
export * from "./flex.ts"
export * from "./flexCss.ts"
export * from "./theme.ts"
export * from "./widgets.ts"
export * from "./scroll-list.ts"
export * from "./notiStack.ts"
