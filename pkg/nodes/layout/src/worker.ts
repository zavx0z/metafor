import {layout} from "./layout.ts"
import type {
  LayoutWorkerEndpoint,
  LayoutWorkerInput,
  LayoutWorkerRequest,
  LayoutWorkerResponse,
  LayoutWorkerSuccess,
} from "../types/worker.ts"
import type {PendingLayout} from "../types/worker-internal.ts"

/**
 * Исполняет один protocol request без доступа к browser globals.
 * Эту функцию использует и настоящий Worker entrypoint, и offline tests.
 */
export function runLayoutWorkerRequest(message: LayoutWorkerRequest): LayoutWorkerResponse {
  try {
    return {
      type: "layout-result",
      requestId: message.requestId,
      generation: message.generation,
      result: layout(message.graph),
    }
  } catch (error) {
    return {
      type: "layout-error",
      requestId: message.requestId,
      generation: message.generation,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Request/response adapter для одного долгоживущего Worker.
 * `dispose()` завершает endpoint и отклоняет все ожидающие requests.
 */
export class LayoutWorkerClient {
  readonly #pending = new Map<number, PendingLayout>()
  #nextRequestId = 1
  #disposed = false

  readonly #onMessage = (event: MessageEvent<LayoutWorkerResponse>): void => {
    const message = event.data
    const pending = this.#pending.get(message.requestId)
    if (pending === undefined) return
    this.#pending.delete(message.requestId)
    if (message.generation !== pending.generation) {
      pending.reject(new Error(`Layout Worker generation mismatch: ${message.requestId}`))
      return
    }
    if (message.type === "layout-error") {
      pending.reject(new Error(message.error))
      return
    }
    pending.resolve(message)
  }

  readonly #onError = (event: ErrorEvent): void => {
    const error = new Error(event.message || "Layout Worker failed")
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }

  /**
   * @param endpoint - Browser Worker или совместимый transport endpoint.
   * Владение endpoint передаётся client: {@link LayoutWorkerClient.dispose}
   * вызовет `terminate()`.
   */
  constructor(private readonly endpoint: LayoutWorkerEndpoint) {
    endpoint.addEventListener("message", this.#onMessage)
    endpoint.addEventListener("error", this.#onError)
  }

  /**
   * Отправляет только {@link LayoutGraph}; UI document и text metrics в protocol
   * отсутствуют.
   *
   * @param input - Graph и monotonic generation владельца приложения.
   * @returns Ответ с geometry той же generation.
   */
  layout(input: LayoutWorkerInput): Promise<LayoutWorkerSuccess> {
    if (this.#disposed) return Promise.reject(new Error("Layout Worker is disposed"))
    const requestId = this.#nextRequestId++
    const message: LayoutWorkerRequest = {type: "layout", requestId, ...input}
    return new Promise((resolve, reject) => {
      this.#pending.set(requestId, {generation: input.generation, resolve, reject})
      try {
        this.endpoint.postMessage(message)
      } catch (error) {
        this.#pending.delete(requestId)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  /** Отклоняет ожидающие requests старее указанной generation. */
  cancelBefore(generation: number): void {
    for (const [requestId, pending] of this.#pending) {
      if (pending.generation >= generation) continue
      this.#pending.delete(requestId)
      pending.reject(new Error(`Stale layout generation: ${pending.generation}`))
    }
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.endpoint.removeEventListener("message", this.#onMessage)
    this.endpoint.removeEventListener("error", this.#onError)
    this.endpoint.terminate()
    const error = new Error("Layout Worker is disposed")
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }
}
