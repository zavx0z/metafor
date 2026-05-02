import {open} from "../store/server.ts"
import {matter} from "./dark.ts"
import {loadMeta} from "./load.ts"
import {MetaFor} from "../metafor"

export {matter} from "./dark.ts"
export {loadMeta} from "./load.ts"

// Гарантируем наличие MetaFor в глобальном контексте для DSL файлов
if (typeof globalThis !== "undefined") {
  ;(globalThis as any).MetaFor = MetaFor
}

if (typeof self !== "undefined" && "postMessage" in self) {
  globalThis.store = await open(":memory:")

  self.onmessage = async (event: MessageEvent<{src?: string}>) => {
    const {src} = event.data
    if (!src) return

    try {
      self.postMessage({type: "status", status: "started", src})
      const meta = await loadMeta(src)
      await matter(meta)
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
