import {open} from "boundary/sqlite"
import {Force} from "force"

/**
 * Server bootstrap Dark: открывает SQLite boundary и корректно закрывает его
 * при остановке процесса. Протокольные сигналы рождаются в ORM.
 */
const BOUNDARY_PATH = process.env.BOUNDARY_PATH ?? "./boundary.sqlite"
const DARK_SERVER_PORT = Number(process.env.PORT ?? 4002)

globalThis.boundary = await open(BOUNDARY_PATH)
const dark = await import("./dark.ts")
dark.ensureBoundaryObserver()

const shutdown = async (signal: string): Promise<void> => {
  await globalThis.boundary.close()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))

const server = Bun.serve({
  port: Number.isFinite(DARK_SERVER_PORT) ? DARK_SERVER_PORT : 4002,
  routes: {
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "dark"})
      },
    },
  },
})

console.log(`[dark] listening on ${server.url}`)

const force = new Force("dark")
force.impulse({type: "create", domain: "matrix", snapshot: await globalThis.boundary.matrixRuntime()})
force.onImpulse = (impulse) => {
  console.log(`[dark] <- force parts=${impulse.parts.length}`)
}
