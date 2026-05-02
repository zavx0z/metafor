import {open} from "../store/server.ts"
import {matter as darkMatter, type MatterOptions} from "./dark.ts"
import type {Actor} from "@store/actor"
import type {SRC} from "../index.ts"
import {MetaFor} from "../metafor"

// Гарантируем наличие MetaFor в глобальном контексте для DSL файлов
if (typeof globalThis !== "undefined") {
  ;(globalThis as any).MetaFor = MetaFor
}

export async function matter(src: SRC, options?: MatterOptions): Promise<Actor> {
  const wimp = (await store.wimp.get(src)) ?? (await store.wimp.create(src))
  return darkMatter(wimp, options)
}

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
