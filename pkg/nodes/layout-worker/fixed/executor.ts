import {layoutFixed} from "@nodes/layout/fixed"
import {createLayoutWorkerExecutor, serializeLayoutWorkerError} from "../executor.ts"
import type {
  FixedLayoutWorkerRequest,
  FixedLayoutWorkerResponse,
} from "../../types/worker.ts"

const execute = createLayoutWorkerExecutor(
  (graph: FixedLayoutWorkerRequest["graph"]) => ({result: layoutFixed(graph)}),
  serializeLayoutWorkerError,
)

/** Executes one fixed-policy request without access to browser globals. */
export function runFixedLayoutWorkerRequest(message: FixedLayoutWorkerRequest): FixedLayoutWorkerResponse {
  return execute(message)
}
