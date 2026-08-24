import {LayoutWorkerTransportClient} from "../transport.ts"
import type {
  AdaptiveLayoutWorkerEndpoint,
  AdaptiveLayoutWorkerFailure,
  AdaptiveLayoutWorkerSuccess,
} from "../types/worker.ts"
import type {AdaptiveLayoutDiagnostics, AdaptiveLayoutGraph} from "@nodes/layout/adaptive"
import type {LayoutResult} from "@nodes/layout/types"

/** Main-thread client for a physically separate adaptive-policy Worker. */
export class AdaptiveLayoutWorkerClient extends LayoutWorkerTransportClient<
  AdaptiveLayoutGraph,
  LayoutResult,
  AdaptiveLayoutDiagnostics,
  AdaptiveLayoutWorkerFailure["error"]
> {
  constructor(endpoint: AdaptiveLayoutWorkerEndpoint) {
    super(endpoint)
  }

  override layout(input: Readonly<{generation: number; graph: AdaptiveLayoutGraph}>): Promise<AdaptiveLayoutWorkerSuccess> {
    return super.layout(input)
  }
}
