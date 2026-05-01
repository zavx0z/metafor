import {open} from "../store/server.ts"
import {matter} from "./dark.ts"
import {Wimp} from "./strong"
import {MetaFor} from "../metafor"

export {matter, matterMeta} from "./dark.ts"

// Гарантируем наличие MetaFor в глобальном контексте для DSL файлов
if (typeof globalThis !== "undefined") {
  ;(globalThis as any).MetaFor = MetaFor
}

if (typeof self !== "undefined" && "postMessage" in self) {
  const store = await open(":memory:")

  self.onmessage = async (event: MessageEvent<{ src?: string }>) => {
    const {src} = event.data
    if (!src) return

    try {
      self.postMessage({type: "status", status: "started", src})
      await matter(new Wimp({src, parent: null}), undefined, {store})
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
