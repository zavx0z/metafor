import type {PlacementResult} from "./placement.ts"
import type {RouteGraphResult} from "./routing.ts"

/** Internal composed solver result; public consumers receive LayoutResult. */
export type EngineResult = Readonly<{
  placement: PlacementResult
  routing: RouteGraphResult
  candidates: Readonly<{generated: number; routable: number}>
}>
