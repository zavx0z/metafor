import {matter} from "./dark"
import {Wimp} from "./strong"

if (typeof self !== "undefined" && "postMessage" in self) {
  self.onmessage = async (event: MessageEvent<{ src?: string }>) => {
    const {src} = event.data
    if (!src) return

    try {
      self.postMessage({type: "status", status: "started", src})
      await matter(new Wimp({src, parent: null}))
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
