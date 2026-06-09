import {open} from "store/server"
import "./dark.ts"

/**
 * Server bootstrap Dark: открывает server store и корректно закрывает его
 * при остановке процесса. Протокол принадлежит домену Dark.
 */
const STORE_PATH = process.env.STORE_PATH ?? "./boundary.sqlite"

globalThis.store = await open(STORE_PATH)

const shutdown = async (signal: string): Promise<void> => {
  await globalThis.store.close()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
