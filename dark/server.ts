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

const server = Bun.serve({
  port: 4002,
  routes: {
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "dark"})
      },
    },
  },
})

console.log(`[dark] listening on ${server.url}`)

let forceReconnect: ReturnType<typeof setTimeout> | undefined
let force = new WebSocket("ws://127.0.0.1:4000/ws")
const reconnect = (): void => {
  if (forceReconnect) return
  forceReconnect = setTimeout(() => {
    forceReconnect = undefined
    force = new WebSocket("ws://127.0.0.1:4000/ws")
    force.onopen = register
    force.onclose = reconnect
    force.onerror = reconnect
  }, 500)
}
const register = (): void => {
  force.send(JSON.stringify({type: "register", domain: "dark", id: "dark-local"}))
  console.log("[dark] connected to Force")
}
force.onopen = register
force.onclose = reconnect
force.onerror = reconnect
