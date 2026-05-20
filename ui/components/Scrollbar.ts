import {scrollbar as renderScrollbar, type ScrollbarOpts} from "./internal/renderers.ts"
import type {Pane} from "@metafor/elements"

export type {ScrollbarOpts}

export function Scrollbar(host: Pane, x: number, y: number, height: number, props: ScrollbarOpts): void {
  renderScrollbar(host, x, y, height, props)
}
