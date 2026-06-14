import {open} from "store/sqlite"

/**
 * Server bootstrap Dark: открывает SQLite store и корректно закрывает его
 * при остановке процесса. Протокольные сигналы рождаются в ORM.
 */
const STORE_PATH = process.env.STORE_PATH ?? "./dark.sqlite"

globalThis.store = await open(STORE_PATH)
await import("./dark.ts")

const shutdown = async (signal: string): Promise<void> => {
  await globalThis.store.close()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
