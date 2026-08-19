import type {
  AdaptiveLayoutDiagnostics,
  AdaptiveLayoutGraph,
  AdaptiveNoLegalSideWitness,
} from "@nodes/layout/adaptive"
import type {FixedLayoutGraph, FixedLayoutResult} from "@nodes/layout/fixed"
import type {LayoutResult} from "@nodes/layout/types"

/** Policy-neutral request envelope for one long-lived layout Worker. */
export type LayoutWorkerRequest<Graph = FixedLayoutGraph> = Readonly<{
  type: "layout"
  requestId: number
  generation: number
  graph: Graph
}>

/** Policy-neutral success envelope; a policy may add structured diagnostics. */
export type LayoutWorkerSuccess<Result = FixedLayoutResult, Diagnostics = never> = Readonly<{
  type: "layout-result"
  requestId: number
  generation: number
  result: Result
}> & ([Diagnostics] extends [never] ? Readonly<Record<never, never>> : Readonly<{
  diagnostics: Diagnostics
}>)

/** Serializable error fields shared by every Worker policy. */
export type SerializedLayoutWorkerError = Readonly<{
  name: string
  message: string
}>

/** Serializable form of the adaptive policy's typed failure. */
export type SerializedAdaptiveLayoutError = Readonly<{
  name: "AdaptiveLayoutError"
  message: string
  code: "NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT"
  witness: AdaptiveNoLegalSideWitness
}>

/** Явная вычислительная ошибка без main-thread fallback. */
export type LayoutWorkerFailure<Failure = SerializedLayoutWorkerError> = Readonly<{
  type: "layout-error"
  requestId: number
  generation: number
  error: Failure
}>

export type LayoutWorkerResponse<
  Result = FixedLayoutResult,
  Diagnostics = never,
  Failure = SerializedLayoutWorkerError,
> = LayoutWorkerSuccess<Result, Diagnostics> | LayoutWorkerFailure<Failure>
export type LayoutWorkerInput<Graph = FixedLayoutGraph> = Omit<LayoutWorkerRequest<Graph>, "type" | "requestId">

/** Минимальная часть browser Worker API, нужная transport adapter. */
export type LayoutWorkerEndpoint<
  Request = LayoutWorkerRequest,
  Response = LayoutWorkerResponse,
> = Readonly<{
  postMessage(message: Request): void
  addEventListener(type: "message", listener: (event: MessageEvent<Response>) => void): void
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void
  removeEventListener(type: "message", listener: (event: MessageEvent<Response>) => void): void
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void
  terminate(): void
}>

/** Fixed policy aliases retained as the compatibility Worker contract. */
export type FixedLayoutWorkerRequest = LayoutWorkerRequest<FixedLayoutGraph>
export type FixedLayoutWorkerSuccess = LayoutWorkerSuccess<FixedLayoutResult>
export type FixedLayoutWorkerFailure = LayoutWorkerFailure<SerializedLayoutWorkerError>
export type FixedLayoutWorkerResponse = FixedLayoutWorkerSuccess | FixedLayoutWorkerFailure
export type FixedLayoutWorkerInput = LayoutWorkerInput<FixedLayoutGraph>
export type FixedLayoutWorkerEndpoint = LayoutWorkerEndpoint<FixedLayoutWorkerRequest, FixedLayoutWorkerResponse>

/** Adaptive policy contract with structured diagnostics and failure witness. */
export type AdaptiveLayoutWorkerRequest = LayoutWorkerRequest<AdaptiveLayoutGraph>
export type AdaptiveLayoutWorkerSuccess = LayoutWorkerSuccess<LayoutResult, AdaptiveLayoutDiagnostics>
export type AdaptiveLayoutWorkerFailure = LayoutWorkerFailure<
  SerializedLayoutWorkerError | SerializedAdaptiveLayoutError
>
export type AdaptiveLayoutWorkerResponse = AdaptiveLayoutWorkerSuccess | AdaptiveLayoutWorkerFailure
export type AdaptiveLayoutWorkerInput = LayoutWorkerInput<AdaptiveLayoutGraph>
export type AdaptiveLayoutWorkerEndpoint = LayoutWorkerEndpoint<
  AdaptiveLayoutWorkerRequest,
  AdaptiveLayoutWorkerResponse
>
