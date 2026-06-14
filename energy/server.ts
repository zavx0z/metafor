import {open} from "store/sqlite"
import type {Store} from "store"

const STORE_PATH = process.env.STORE_PATH ?? "./energy.sqlite"

;(globalThis as typeof globalThis & {store: Store}).store = await open(STORE_PATH)

const shutdown = async (): Promise<void> => {
  await globalThis.store.close()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown())
process.on("SIGTERM", () => void shutdown())
