import {GRAVITY_BROADCAST_CHANNEL, isGravitonMessage} from "@shared/protocol"
import {MetaFor} from "../metafor"
import {open} from "store/server"
import {matter} from "./dark.ts"

// DSL-файлы `github/.../meta.ts` обращаются к `MetaFor(...)` как к глобальной функции,
// поэтому регистрируем её до первого dynamic import меты.
;(globalThis as unknown as {MetaFor: typeof MetaFor}).MetaFor = MetaFor

/**
 * Серверный демон Dark: открывает файловый store через `store/server.open()`,
 * публикует его в `globalThis.store`, и слушает `gravity`-канал на входящие
 * гравитоны вида `add /wimp/<src>` — по такому патчу запускает `matter(src)`,
 * который через ORM пишет wimp + actor + topology rows.
 *
 * Исходящие сообщения от самого Dark (`source === "dark"`) пропускаются,
 * чтобы не было обратной обработки собственных `/wimp/<id>` add'ов и barrier'ов.
 */

const STORE_PATH = process.env.DARK_STORE_PATH ?? "./boundary.sqlite"

globalThis.store = await open(STORE_PATH)

const decodeSegment = (s: string): string => s.replace(/~1/g, "/").replace(/~0/g, "~")

/** Извлекает `src` из path вида `/wimp/<encoded-src>`; возвращает `null`, если path не той формы. */
const extractWimpSrc = (path: string): string | null => {
  if (!path.startsWith("/wimp/")) return null
  const rest = path.slice("/wimp/".length)
  if (rest.length === 0 || rest.includes("/")) return null
  return decodeSegment(rest)
}


const gravity = new BroadcastChannel(GRAVITY_BROADCAST_CHANNEL)

const handleWimpLoad = async (src: string): Promise<void> => {
  const existing = await globalThis.store.wimp.get(src)
  if (existing) {
    console.log(`[dark/server] wimp "${src}" уже в store — пропуск`)
    return
  }
  console.log(`[dark/server] загружаю wimp "${src}"`)
  try {
    const wimp = await globalThis.store.wimp.create(src)
    await matter(wimp)
    console.log(`[dark/server] wimp "${src}" материализован`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[dark/server] ошибка загрузки "${src}": ${message}`)
  }
}

gravity.addEventListener("message", (event) => {
  const data = (event as MessageEvent<unknown>).data
  if (!isGravitonMessage(data)) return
  if (data.source === "dark") return // собственные сообщения не обрабатываем

  for (const patch of data.patches) {
    if (patch.op !== "add") continue
    const src = extractWimpSrc(patch.path)
    if (!src) continue
    void handleWimpLoad(src)
  }
})

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[dark/server] ${signal} — закрываю канал и store`)
  gravity.close()
  await globalThis.store.close()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))

console.log(
  `[dark/server] dark store ready at "${STORE_PATH}"; слушаю gravity channel "${GRAVITY_BROADCAST_CHANNEL}" на add /wimp/<src>`,
)
