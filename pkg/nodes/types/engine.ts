import type {LayoutDirection} from "@nodes/layout"
import type {NodeSystemTextMeasurer} from "./card.ts"

export type NodeSystemLayoutDirection = LayoutDirection

/** Main-thread options for measuring a UI document before automatic layout. */
export type MetaForNodeSystemLayoutOptions = Readonly<{
  clearance?: number
  nodeSpacing?: number
  layerSpacing?: number
  padding?: number
  measureText?: NodeSystemTextMeasurer
}>

export type MetaForNodeSystemLayoutRequest = Readonly<{
  viewport: Readonly<{width: number; height: number}>
}>
