import {runFixedLayoutWorkerRequest} from "@nodes/layout-worker/fixed/executor"
import type {FixedLayoutWorkerRequest, FixedLayoutWorkerResponse} from "@nodes/layout-worker/types"

export function executeFixedLayoutWorker(request: FixedLayoutWorkerRequest): FixedLayoutWorkerResponse {
  return runFixedLayoutWorkerRequest(request)
}
