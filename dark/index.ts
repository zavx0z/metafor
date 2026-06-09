import {open} from "../store/server.ts"
import {matter} from "./dark.ts"
export {matter}
export type {MatterOptions} from "./dark.ts"

if (typeof self !== "undefined" && "postMessage" in self) {
  globalThis.store = await open(":memory:")

  self.onmessage = async (event: MessageEvent<{src?: string}>) => {
    const {src} = event.data
    if (!src) return

    try {
      self.postMessage({type: "status", status: "started", src})
      await matter(src)
      self.postMessage({type: "status", status: "done", src})
    } catch (error) {
      self.postMessage({
        type: "status",
        status: "error",
        src,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
