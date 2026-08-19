import {
  runFixedLayoutWorkerRequest,
} from "nodes/layout-worker/fixed/executor"
import type {
  FixedLayoutWorkerRequest,
  FixedLayoutWorkerResponse,
} from "nodes/types"

type LayoutWorkerScope = Readonly<{
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<FixedLayoutWorkerRequest>) => void,
  ): void
  postMessage(message: FixedLayoutWorkerResponse): void
}>

const scope = globalThis as unknown as LayoutWorkerScope

scope.addEventListener("message", (event) => {
  if (event.data?.type !== "layout") return
  scope.postMessage(runFixedLayoutWorkerRequest(event.data))
})
