import {AdaptiveLayoutWorkerClient} from "@nodes/layout-worker/adaptive/client"
import type {AdaptiveLayoutWorkerEndpoint} from "@nodes/layout-worker/types"

export function createAdaptiveLayoutWorkerClient(endpoint: AdaptiveLayoutWorkerEndpoint): AdaptiveLayoutWorkerClient {
  return new AdaptiveLayoutWorkerClient(endpoint)
}
