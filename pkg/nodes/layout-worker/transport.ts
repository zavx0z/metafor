import type {PendingLayout} from "../types/worker-internal.ts"
import type {
  LayoutWorkerEndpoint,
  LayoutWorkerFailure,
  LayoutWorkerInput,
  LayoutWorkerRequest,
  LayoutWorkerSuccess,
  SerializedLayoutWorkerError,
} from "../types/worker.ts"

/** Error received from a Worker without running a main-thread fallback. */
export class LayoutWorkerRemoteError<Failure extends SerializedLayoutWorkerError = SerializedLayoutWorkerError>
  extends Error {
  constructor(readonly serialized: Failure) {
    super(serialized.message)
    this.name = serialized.name
  }
}

/**
 * Policy-neutral request/response lifecycle for one long-lived Worker.
 *
 * The transport never imports or invokes a layout policy. A concrete client
 * supplies only its serializable graph/result/error types.
 */
export class LayoutWorkerTransportClient<
  Graph,
  Result,
  Diagnostics = never,
  Failure extends SerializedLayoutWorkerError = SerializedLayoutWorkerError,
> {
  readonly #pending = new Map<number, PendingLayout<LayoutWorkerSuccess<Result, Diagnostics>>>()
  #nextRequestId = 1
  #disposed = false

  readonly #onMessage = (event: MessageEvent<LayoutWorkerSuccess<Result, Diagnostics> | LayoutWorkerFailure<Failure>>): void => {
    const message = event.data
    const pending = this.#pending.get(message.requestId)
    if (pending === undefined) return
    this.#pending.delete(message.requestId)
    if (message.generation !== pending.generation) {
      pending.reject(new Error(`Layout Worker generation mismatch: ${message.requestId}`))
      return
    }
    if (message.type === "layout-error") {
      pending.reject(new LayoutWorkerRemoteError(message.error))
      return
    }
    pending.resolve(message)
  }

  readonly #onError = (event: ErrorEvent): void => {
    const error = new Error(event.message || "Layout Worker failed")
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }

  /** Ownership of the endpoint is transferred to this client. */
  constructor(private readonly endpoint: LayoutWorkerEndpoint<
    LayoutWorkerRequest<Graph>,
    LayoutWorkerSuccess<Result, Diagnostics> | LayoutWorkerFailure<Failure>
  >) {
    endpoint.addEventListener("message", this.#onMessage)
    endpoint.addEventListener("error", this.#onError)
  }

  /** Sends one graph to the Worker and waits for the matching generation. */
  layout(input: LayoutWorkerInput<Graph>): Promise<LayoutWorkerSuccess<Result, Diagnostics>> {
    if (this.#disposed) return Promise.reject(new Error("Layout Worker is disposed"))
    const requestId = this.#nextRequestId++
    const message: LayoutWorkerRequest<Graph> = {type: "layout", requestId, ...input}
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

  /** Rejects pending requests older than the supplied generation. */
  cancelBefore(generation: number): void {
    for (const [requestId, pending] of this.#pending) {
      if (pending.generation >= generation) continue
      this.#pending.delete(requestId)
      pending.reject(new Error(`Stale layout generation: ${pending.generation}`))
    }
  }

  /** Terminates the owned endpoint and rejects every pending request. */
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
