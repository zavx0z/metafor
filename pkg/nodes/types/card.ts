import type {NodeSystemFact, NodeSystemPort, NodeSystemRect} from "./model.ts"

/** Intrinsic card size measured on the main thread. */
export type NodeSystemCardSize = Readonly<{width: number; height: number}>
export type NodeSystemTextMeasurer = (value: string, fontPx: number) => number
export type NodeSystemCardFactSlot = Readonly<{fact: NodeSystemFact; row: NodeSystemRect; label: NodeSystemRect; value: NodeSystemRect}>
export type NodeSystemCardPortSlot = Readonly<{port: NodeSystemPort; row: NodeSystemRect; marker: NodeSystemRect}>
export type NodeSystemCardPlan = Readonly<{
  frame: NodeSystemRect
  header: NodeSystemRect
  body: NodeSystemRect
  title: NodeSystemRect
  kind?: NodeSystemRect
  summary?: NodeSystemRect
  facts: readonly NodeSystemCardFactSlot[]
  ports: readonly NodeSystemCardPortSlot[]
}>

/** Internal measurement is exported for implementations, not required by callers. */
export type NodeSystemCardMeasurement = Readonly<{
  size: NodeSystemCardSize
  exact: boolean
  kindWidth: number
  factLabelWidths: ReadonlyMap<string, number>
}>
