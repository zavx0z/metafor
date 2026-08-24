import type {
  LayoutWorkerFailure,
  LayoutWorkerRequest,
  LayoutWorkerSuccess,
  SerializedLayoutWorkerError,
} from "./types/worker.ts"

export type LayoutWorkerComputation<Result, Diagnostics = never> = Readonly<{
  result: Result
}> & ([Diagnostics] extends [never] ? Readonly<Record<never, never>> : Readonly<{
  diagnostics: Diagnostics
}>)

/** Serializes an ordinary exception without relying on structured-cloning Error. */
export function serializeLayoutWorkerError(error: unknown): SerializedLayoutWorkerError {
  return error instanceof Error
    ? {name: error.name, message: error.message}
    : {name: "Error", message: String(error)}
}

/**
 * Builds an executor envelope around one concrete pure policy.
 *
 * Policy modules provide the calculation and optional typed serializer; this
 * shared lifecycle never imports fixed or adaptive implementation code.
 */
export function createLayoutWorkerExecutor<
  Graph,
  Result,
  Diagnostics = never,
  Failure extends SerializedLayoutWorkerError = SerializedLayoutWorkerError,
>(
  calculate: (graph: Graph) => LayoutWorkerComputation<Result, Diagnostics>,
  serializeError: (error: unknown) => Failure,
): (
  message: LayoutWorkerRequest<Graph>,
) => LayoutWorkerSuccess<Result, Diagnostics> | LayoutWorkerFailure<Failure> {
  return (message) => {
    try {
      return {
        type: "layout-result",
        requestId: message.requestId,
        generation: message.generation,
        ...calculate(message.graph),
      } as LayoutWorkerSuccess<Result, Diagnostics>
    } catch (error) {
      return {
        type: "layout-error",
        requestId: message.requestId,
        generation: message.generation,
        error: serializeError(error),
      }
    }
  }
}
