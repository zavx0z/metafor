import {
  AdaptiveLayoutError,
  layoutAdaptiveWithDiagnostics,
} from "@nodes/layout/adaptive"
import {createLayoutWorkerExecutor, serializeLayoutWorkerError} from "../executor.ts"
import type {
  AdaptiveLayoutWorkerFailure,
  AdaptiveLayoutWorkerRequest,
  AdaptiveLayoutWorkerResponse,
  SerializedAdaptiveLayoutError,
} from "../types/worker.ts"

const execute = createLayoutWorkerExecutor(
  (graph: AdaptiveLayoutWorkerRequest["graph"]) => layoutAdaptiveWithDiagnostics(graph),
  serializeAdaptiveLayoutWorkerError,
)

/** Executes one adaptive-policy request and preserves diagnostics or witness. */
export function runAdaptiveLayoutWorkerRequest(
  message: AdaptiveLayoutWorkerRequest,
): AdaptiveLayoutWorkerResponse {
  return execute(message)
}

function serializeAdaptiveLayoutWorkerError(error: unknown): AdaptiveLayoutWorkerFailure["error"] {
  if (!(error instanceof AdaptiveLayoutError)) return serializeLayoutWorkerError(error)
  const serialized: SerializedAdaptiveLayoutError = {
    name: "AdaptiveLayoutError",
    message: error.message,
    code: error.code,
    witness: error.witness,
  }
  return serialized
}
