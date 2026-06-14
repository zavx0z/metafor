import {force, type ForceSurface} from "@metafor/boundary"

;(globalThis as typeof globalThis & {force: ForceSurface}).force = force

const shutdown = (): void => {
  force.close()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
