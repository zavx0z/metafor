import {open} from "boundary/sqlite"

/**
 * Server bootstrap Dark: открывает SQLite boundary и корректно закрывает его
 * при остановке процесса. Протокольные сигналы рождаются в ORM.
 */
const BOUNDARY_PATH = process.env.BOUNDARY_PATH ?? "./boundary.sqlite"

globalThis.boundary = await open(BOUNDARY_PATH)
const dark = await import("./dark.ts")
dark.ensureBoundaryObserver()

const shutdown = async (signal: string): Promise<void> => {
  await globalThis.boundary.close()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
