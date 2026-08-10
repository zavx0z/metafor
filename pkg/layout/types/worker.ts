import type {LayoutGraph, LayoutResult} from "./protocol.ts"

/** Запрос к долгоживущему layout Worker. */
export type LayoutWorkerRequest = Readonly<{
  type: "layout"
  requestId: number
  generation: number
  graph: LayoutGraph
}>

/** Успешный ответ layout Worker. */
export type LayoutWorkerSuccess = Readonly<{
  type: "layout-result"
  requestId: number
  generation: number
  result: LayoutResult
}>

/** Явная вычислительная ошибка без main-thread fallback. */
export type LayoutWorkerFailure = Readonly<{
  type: "layout-error"
  requestId: number
  generation: number
  error: string
}>

export type LayoutWorkerResponse = LayoutWorkerSuccess | LayoutWorkerFailure
export type LayoutWorkerInput = Omit<LayoutWorkerRequest, "type" | "requestId">

/** Минимальная часть browser Worker API, нужная transport adapter. */
export type LayoutWorkerEndpoint = Readonly<{
  postMessage(message: LayoutWorkerRequest): void
  addEventListener(type: "message", listener: (event: MessageEvent<LayoutWorkerResponse>) => void): void
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void
  removeEventListener(type: "message", listener: (event: MessageEvent<LayoutWorkerResponse>) => void): void
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void
  terminate(): void
}>
