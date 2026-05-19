import {scrollbar as renderScrollbar, type ScrollbarOpts} from "./internal/renderers.ts"
import type {Card} from "@metafor/elements"

export type {ScrollbarOpts}

export function Scrollbar(host: Card, x: number, y: number, height: number, props: ScrollbarOpts): void {
  renderScrollbar(host, x, y, height, props)
}
