import {runAdaptiveLayoutWorkerRequest} from "nodes/layout-worker/adaptive/executor"
import type {AdaptiveLayoutWorkerRequest, AdaptiveLayoutWorkerResponse} from "nodes/layout-worker/types"

export function executeAdaptiveLayoutWorker(request: AdaptiveLayoutWorkerRequest): AdaptiveLayoutWorkerResponse {
  return runAdaptiveLayoutWorkerRequest(request)
}
