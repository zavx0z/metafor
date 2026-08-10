import {
  runLayoutWorkerRequest,
  type LayoutWorkerRequest,
  type LayoutWorkerResponse,
} from "@nodes/layout"

type LayoutWorkerScope = Readonly<{
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<LayoutWorkerRequest>) => void,
  ): void
  postMessage(message: LayoutWorkerResponse): void
}>

const scope = globalThis as unknown as LayoutWorkerScope

scope.addEventListener("message", (event) => {
  if (event.data?.type !== "layout") return
  scope.postMessage(runLayoutWorkerRequest(event.data))
})
