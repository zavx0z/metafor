import {LayoutWorkerTransportClient} from "../transport.ts"
import type {
  FixedLayoutWorkerEndpoint,
  FixedLayoutWorkerFailure,
  FixedLayoutWorkerSuccess,
} from "../../types/worker.ts"
import type {FixedLayoutGraph, FixedLayoutResult} from "@nodes/layout/fixed"

/** Main-thread client for a physically separate fixed-policy Worker. */
export class FixedLayoutWorkerClient extends LayoutWorkerTransportClient<
  FixedLayoutGraph,
  FixedLayoutResult,
  never,
  FixedLayoutWorkerFailure["error"]
> {
  constructor(endpoint: FixedLayoutWorkerEndpoint) {
    super(endpoint)
  }

  override layout(input: Readonly<{generation: number; graph: FixedLayoutGraph}>): Promise<FixedLayoutWorkerSuccess> {
    return super.layout(input)
  }
}
