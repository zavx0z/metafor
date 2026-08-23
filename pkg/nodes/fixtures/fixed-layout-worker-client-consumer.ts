import {FixedLayoutWorkerClient} from "nodes/layout-worker/fixed/client"
import type {FixedLayoutWorkerEndpoint} from "nodes/layout-worker/types"

export function createFixedLayoutWorkerClient(endpoint: FixedLayoutWorkerEndpoint): FixedLayoutWorkerClient {
  return new FixedLayoutWorkerClient(endpoint)
}
