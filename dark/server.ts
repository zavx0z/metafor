import {createProtocolChannel, protocolPatches} from "../protocol.ts"
import {MetaFor} from ".."
import {open} from "store/server"
import {matter} from "./dark.ts"

// DSL-файлы `github/.../meta.ts` обращаются к `MetaFor(...)` как к глобальной функции,
// поэтому регистрируем её до первого dynamic import меты.
;(globalThis as unknown as {MetaFor: typeof MetaFor}).MetaFor = MetaFor

/**
 * Серверный демон Dark: открывает файловый store через `store/server.open()`,
 * публикует его в `globalThis.store`, и слушает единый protocol channel на входящие
 * graviton-патчи вида `add /wimp/<src>` — по такому патчу запускает `matter(src)`,
 * который через ORM пишет wimp + actor + topology rows.
 */
const STORE_PATH = process.env.STORE_PATH ?? "./boundary.sqlite"

globalThis.store = await open(STORE_PATH)

const decodeSegment = (s: string): string => s.replace(/~1/g, "/").replace(/~0/g, "~")

/** Извлекает `src` из path вида `/wimp/<encoded-src>`; возвращает `null`, если path не той формы. */
const extractWimpSrc = (path: string): string | null => {
  if (!path.startsWith("/wimp/")) return null
  const rest = path.slice("/wimp/".length)
  if (rest.length === 0 || rest.includes("/")) return null
  return decodeSegment(rest)
}

const protocol = createProtocolChannel()

const handleWimpLoad = async (src: string): Promise<void> => {
  const existing = await globalThis.store.wimp.get(src)
  if (existing) return
  try {
    const wimp = await globalThis.store.wimp.create(src)
    await matter(wimp)
  } catch {
  }
}

protocol.addEventListener("message", (event) => {
  for (const patch of protocolPatches(event.data)) {
    if (patch.part !== "graviton") continue
    if (patch.op !== "add" || typeof patch.path !== "string") continue
    const src = extractWimpSrc(patch.path)
    if (!src) continue
    void handleWimpLoad(src)
  }
})

const shutdown = async (signal: string): Promise<void> => {
  protocol.close()
  await globalThis.store.close()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
