import {open} from "@metafor/boundary/sqlite"
import type {Boundary} from "@metafor/boundary"

const BOUNDARY_PATH = process.env.BOUNDARY_PATH ?? "./energy.sqlite"

;(globalThis as typeof globalThis & {boundary: Boundary}).boundary = await open(BOUNDARY_PATH)

const shutdown = async (): Promise<void> => {
  await globalThis.boundary.close()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown())
process.on("SIGTERM", () => void shutdown())
